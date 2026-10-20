import importlib
import struct
import pytest
from fastapi.testclient import TestClient


def crc(data):
    value = 0
    for byte in data:
        value ^= byte
        for _ in range(8):
            value = (value >> 1) ^ (0xA001 if value & 1 else 0)
    return value


def fit(sports):
    # FIT session definition: start_time, sport, timer time, distance, average HR.
    fields = [(2, 4, 0x86), (5, 1, 0), (8, 4, 0x86), (9, 4, 0x86), (16, 1, 2)]
    data = bytes([0x40, 0, 0]) + struct.pack('<H', 18) + bytes([len(fields)])
    data += b''.join(bytes(f) for f in fields)
    for sport in sports:
        data += bytes([0]) + struct.pack('<IBIIB', 1000000000, sport, 600000, 100000, 140)
    header = struct.pack('<BBHI4s', 14, 0x10, 100, len(data), b'.FIT')
    header += struct.pack('<H', crc(header))
    return header + data + struct.pack('<H', crc(header + data))


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv('TRIATHLON_DATA_DIR', str(tmp_path))
    from backend import app
    importlib.reload(app)
    return TestClient(app.app)


@pytest.mark.parametrize('sports,expected', [([1], 'running'), ([2], 'cycling'), ([5,3,2,3,1], 'multisport')])
def test_import_and_detail(client, sports, expected):
    raw = fit(sports)
    response = client.post('/api/import', files={'files': ('sample.fit', raw)})
    assert response.status_code == 200
    result = response.json()[0]
    assert result['status'] == 'imported'
    activity = client.get('/api/activities/' + result['id']).json()
    assert activity['sport_type'] == expected
    assert activity['distance_meters'] == 1000 * len(sports)
    assert activity['duration_seconds'] == 600 * len(sports)
    assert len(activity['sessions']) == len(sports)
    assert activity['avg_heart_rate'] == 140
    assert client.post('/api/import', files={'files': ('copy.fit', raw)}).json()[0]['status'] == 'duplicate'
    assert len(client.get('/api/activities').json()) == 1
    assert client.get('/api/activities?sport=unknown').json() == []


def test_invalid_and_corrupt(client):
    assert 'error' in client.post('/api/import', files={'files': ('bad.fit', b'not fit')}).json()[0]
    raw = bytearray(fit([1]))
    raw[-1] ^= 1
    assert 'error' in client.post('/api/import', files={'files': ('bad.fit', bytes(raw))}).json()[0]
    assert client.get('/api/activities').json() == []
    assert client.get('/api/activities/missing').status_code == 404
    assert client.get('/api/health').json() == {'status': 'ok'}
