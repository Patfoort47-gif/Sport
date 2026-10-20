from unittest.mock import Mock
import time

from fastapi.testclient import TestClient
import pytest

from backend import garmin_service as service

OWNER='11111111-1111-4111-8111-111111111111'
OTHER='22222222-2222-4222-8222-222222222222'
SECRET='never-return-this-password'


@pytest.fixture
def setup(monkeypatch):
    service.attempts.clear();service.challenges.clear()
    service.app.dependency_overrides[service.require_user]=lambda:OWNER
    api=Mock();api.client.login.return_value=(None,None);api.client.dumps.return_value='private-session'
    cloud=Mock();cloud.acquire.return_value=True
    monkeypatch.setattr(service,'Garmin',lambda:api)
    monkeypatch.setattr(service,'cloud_for',lambda owner:cloud)
    yield TestClient(service.app),api,cloud
    service.app.dependency_overrides.clear()


def connect(client):
    return client.post('/garmin/connect',json={'email':'garmin@example.test','password':SECRET})


def test_password_login_only_returns_status_and_saves_session(setup):
    client,api,cloud=setup
    response=connect(client)
    assert response.json()=={'status':'connected'}
    assert response.headers['cache-control']=='no-store'
    api.client.login.assert_called_once_with('garmin@example.test',SECRET,return_on_mfa=True)
    cloud.save_session.assert_called_once_with('private-session')
    cloud.release.assert_called_once()
    assert SECRET not in response.text


def test_mfa_challenge_is_bound_to_owner_and_not_a_credential(setup):
    client,api,cloud=setup
    api.client.login.return_value=('needs_mfa',None)
    challenge=connect(client).json()['challenge_id']
    cloud.release.assert_not_called()
    cloud.save_session.assert_not_called()
    service.app.dependency_overrides[service.require_user]=lambda:OTHER
    denied=client.post('/garmin/mfa',json={'challenge_id':challenge,'code':'123456'})
    assert denied.status_code==403
    service.app.dependency_overrides[service.require_user]=lambda:OWNER
    response=client.post('/garmin/mfa',json={'challenge_id':challenge,'code':'123456'})
    assert response.json()=={'status':'connected'}
    api.client.resume_login.assert_called_once_with(None,'123456')
    assert challenge not in service.challenges
    cloud.save_session.assert_called_once()
    cloud.release.assert_called_once()


def test_expired_challenge_and_cancellation(setup):
    client,api,cloud=setup
    api.client.login.return_value=('needs_mfa',None)
    challenge=connect(client).json()['challenge_id']
    assert client.delete('/garmin/challenge/'+challenge).status_code==200
    assert challenge not in service.challenges
    assert client.post('/garmin/mfa',json={'challenge_id':challenge,'code':'123456'}).status_code==410
    challenge=connect(client).json()['challenge_id']
    service.challenges[challenge].expires=time.monotonic()-1
    assert client.post('/garmin/mfa',json={'challenge_id':challenge,'code':'123456'}).status_code==410


def test_auth_failures_and_validation_do_not_echo_credentials(setup):
    client,api,cloud=setup
    api.client.login.side_effect=RuntimeError(SECRET)
    response=connect(client)
    assert response.status_code==502
    assert SECRET not in response.text
    cloud.save_session.assert_not_called();cloud.release.assert_called_once()
    response=client.post('/garmin/connect',json={'email':'x','password':SECRET})
    assert response.status_code==422
    assert SECRET not in response.text


def test_rate_limit_and_busy_sync_dont_contact_garmin(setup):
    client,api,cloud=setup
    cloud.acquire.return_value=False
    assert connect(client).status_code==409
    api.client.login.assert_not_called()
    cloud.acquire.return_value=True
    for _ in range(4):assert connect(client).status_code==200
    assert connect(client).status_code==429


def test_sync_runs_without_exposing_session(setup,monkeypatch):
    client,api,cloud=setup
    cloud.load_session.return_value='private-session'
    sync=Mock()
    monkeypatch.setattr(service,'synchronize',sync)
    response=client.post('/garmin/sync')
    assert response.status_code==202
    assert response.json()=={'status':'scheduled'}
    api.login.assert_called_once_with('private-session')
    sync.assert_called_once_with(api,cloud,max_activities=20)
    cloud.release.assert_called_once()


def test_require_user_validates_token_with_supabase_and_personal_owner(monkeypatch):
    monkeypatch.setenv('SUPABASE_SERVICE_ROLE_KEY','test-server-key')
    monkeypatch.setenv('SUPABASE_USER_ID',OWNER)
    verify=Mock(return_value=OWNER)
    monkeypatch.setattr(service,'verify_user',verify)
    client=TestClient(service.app)
    assert client.get('/garmin/status').status_code==401
    assert client.post('/garmin/connect',headers={'Authorization':'Bearer test','Origin':'https://evil.example'},json={'email':'a@example.test','password':SECRET}).status_code==403
    verify.assert_not_called()
    verify.return_value=OTHER
    assert client.get('/garmin/status',headers={'Authorization':'Bearer test'}).status_code==403
    verify.side_effect=RuntimeError('private-token')
    response=client.get('/garmin/status',headers={'Authorization':'Bearer test'})
    assert response.status_code==401
    assert 'private-token' not in response.text


def test_health_and_cors():
    client=TestClient(service.app)
    assert client.get('/health').json()=={'status':'ok'}
    response=client.options('/garmin/connect',headers={'Origin':service.ORIGIN,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'})
    assert response.status_code==200
    assert response.headers['access-control-allow-origin']==service.ORIGIN
    denied=client.options('/garmin/connect',headers={'Origin':'https://evil.example','Access-Control-Request-Method':'POST'})
    assert 'access-control-allow-origin' not in denied.headers


def test_history_authenticated_batch_and_lease_release(setup, monkeypatch):
    from datetime import date
    client, api, cloud = setup
    cloud.load_session.return_value = 'private-session'
    batch = Mock(return_value={'done': False, 'next_offset': 40, 'imported': 20})
    monkeypatch.setattr(service, 'synchronize_history_batch', batch)
    response = client.post('/garmin/history', json={'since': '2018-01-01', 'offset': 20})
    assert response.status_code == 200
    assert response.json()['next_offset'] == 40
    batch.assert_called_once_with(api, cloud, date(2018, 1, 1), 20)
    cloud.release.assert_called_once()
    assert client.post('/garmin/history', json={'offset': -1}).status_code == 422
    assert client.post('/garmin/history', json={'since': '2099-01-01'}).status_code == 422


def test_history_busy_does_not_release_another_lease(setup):
    client, api, cloud = setup
    cloud.acquire.return_value = False
    assert client.post('/garmin/history', json={}).status_code == 409
    cloud.release.assert_not_called()
    api.login.assert_not_called()


def test_history_failure_is_sanitized_and_unlocks_for_retry(setup, monkeypatch):
    client, api, cloud = setup
    cloud.load_session.return_value = 'private-session'
    monkeypatch.setattr(service, 'synchronize_history_batch', Mock(side_effect=RuntimeError(SECRET)))
    response = client.post('/garmin/history', json={})
    assert response.status_code == 502
    assert SECRET not in response.text
    cloud.save_session.assert_called_once()
    cloud.release.assert_called_once()
