from io import BytesIO
import json
from zipfile import ZipFile
from unittest.mock import Mock

import httpx
import pytest

from scripts.sync_garmin import Cloud, fit_files, synchronize
from tests.test_app import fit

OWNER = '11111111-1111-4111-8111-111111111111'


def api_for(activities):
    api = Mock()
    api.get_activities.return_value = activities
    api.download_activity.return_value = fit([1])
    api.client.dumps.return_value = 'refreshed-private-session'
    return api


def cloud_for(imported=False):
    cloud = Mock()
    cloud.imported.return_value = imported
    return cloud


def test_zip_and_raw_fit():
    raw = fit([1])
    assert fit_files(raw) == [raw]
    output = BytesIO()
    with ZipFile(output, 'w') as archive:
        archive.writestr('../../sample.fit', raw)
        archive.writestr('ignored.txt', 'metadata')
    assert fit_files(output.getvalue()) == [raw]
    with pytest.raises(ValueError):
        fit_files(b'<html>Not a FIT export</html>')


def test_sync_imports_then_marks_and_refreshes_session():
    api = api_for([{'activityId': 42, 'activityName': 'My run'}])
    cloud = cloud_for()
    assert synchronize(api, cloud, pause=lambda _: None) == 1
    cloud.upload.assert_called_once_with(fit([1]), 'My run')
    cloud.mark_imported.assert_called_once_with('42')
    cloud.save_session.assert_called_once_with('refreshed-private-session')
    assert cloud.status.call_args.kwargs['success'] is True


def test_duplicate_does_not_download_again():
    api = api_for([{'activityId': 42}])
    cloud = cloud_for(imported=True)
    assert synchronize(api, cloud, pause=lambda _: None) == 0
    api.download_activity.assert_not_called()
    cloud.mark_imported.assert_not_called()


def test_failed_upload_is_not_marked_imported_and_session_is_preserved():
    api = api_for([{'activityId': 42}])
    cloud = cloud_for()
    cloud.upload.side_effect = RuntimeError('private internal detail')
    with pytest.raises(RuntimeError):
        synchronize(api, cloud, pause=lambda _: None)
    cloud.mark_imported.assert_not_called()
    cloud.save_session.assert_called_once()
    assert 'private internal detail' not in str(cloud.status.call_args_list)


def test_pagination_and_partial_failures_are_restartable():
    api = api_for([])
    api.get_activities.side_effect = [[{'activityId': i} for i in range(1, 51)], [{'activityId': 51}]]
    cloud = cloud_for()
    assert synchronize(api, cloud, max_activities=100, pause=lambda _: None) == 51
    assert api.get_activities.call_args_list[1].args == (50, 50)


def test_cloud_storage_contract_and_owner_scope():
    requests = []
    def respond(request):
        requests.append(request)
        if request.url.path.endswith('/sport_load_garmin_session'):
            return httpx.Response(200, json='test-private-session')
        return httpx.Response(200, json=[])
    http = httpx.Client(base_url='https://example.supabase.co', transport=httpx.MockTransport(respond))
    cloud = Cloud('https://example.supabase.co', 'test-server-key', OWNER, client=http)
    cloud.upload(fit([1]), 'Training')
    assert len(requests) == 3
    assert requests[0].url.path.startswith(f'/storage/v1/object/sport-files/{OWNER}/')
    detail = json.loads(requests[1].content)
    row = json.loads(requests[2].content)
    assert detail['id'] == row['id']
    assert detail['sport_type'] == 'running'
    assert row['owner_id'] == OWNER
    assert row['start_time'].endswith('Z')
    assert detail['sessions'][0]['start_time'].endswith('Z')
    assert cloud.load_session() == 'test-private-session'


def test_invalid_owner_or_url_rejected_before_network():
    with pytest.raises(ValueError):
        Cloud('http://untrusted.test', 'secret', OWNER)
    with pytest.raises(ValueError):
        Cloud('https://example.supabase.co', 'secret', '../other-user')


def test_history_pages_since_2018_with_durable_deduplication(monkeypatch):
    from datetime import date
    from scripts.sync_garmin import synchronize_history_batch
    monkeypatch.setattr('scripts.sync_garmin.time.sleep', lambda _: None)
    api = api_for([{'activityId': i, 'startTimeLocal': '2018-01-01 10:00:00'} for i in range(20)])
    cloud = cloud_for()
    cloud.imported.side_effect = lambda identity: identity == '0'
    result = synchronize_history_batch(api, cloud, date(2018, 1, 1))
    assert result == {'done': False, 'next_offset': 20, 'imported': 19, 'scanned': 20, 'oldest_date': '2018-01-01'}
    api.get_activities.assert_called_once_with(0, 20)
    api.get_activities.return_value = [{'activityId': 21, 'startTimeGMT': '2017-12-31 10:00:00'}]
    result = synchronize_history_batch(api, cloud, date(2018, 1, 1), 20)
    assert result['done'] is True
    assert result['imported'] == 0
    assert api.download_activity.call_count == 19


def test_history_failure_preserves_retry_and_rejects_undated_activity(monkeypatch):
    from datetime import date
    from scripts.sync_garmin import synchronize_history_batch
    api = api_for([{'activityId': 42, 'startTimeLocal': '2019-06-01'}])
    cloud = cloud_for()
    cloud.upload.side_effect = RuntimeError('storage quota')
    with pytest.raises(RuntimeError):
        synchronize_history_batch(api, cloud, date(2018, 1, 1))
    cloud.mark_imported.assert_not_called()
    api.get_activities.return_value = [{'activityId': 42}]
    with pytest.raises(ValueError):
        synchronize_history_batch(api, cloud, date(2018, 1, 1))
