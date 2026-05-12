from flask import Blueprint, request, jsonify
from auth import token_required
from models.models import db, Device
from zk import ZK, const

devices_bp = Blueprint('devices', __name__)

@devices_bp.route('/devices-status', methods=['GET'])
@token_required
def device_status():  
    devices = Device.query.all()
    
    device_list = []
    for device in devices:
        device_list.append({
            'id': device.id,
            'ip': device.ip,
            'port': device.port,
            'location': device.location,
            'isActive': device.isActive
        })
    
    return jsonify({'data': device_list}), 200

@devices_bp.route('/devices-location', methods=['GET'])
@token_required
def get_all_device_locations():  
    devices = Device.query.filter_by(isActive=1).all()
    
    device_list = []
    for device in devices:
        device_list.append({
            'id': device.id,
            'ip': device.ip,
            'port': device.port,
            'location': device.location,
            'isActive': device.isActive
        })
    
    return jsonify({'data': device_list}), 200

@devices_bp.route('/devices', methods=['POST'])
@token_required
def create_device():
    data = request.get_json()
    required = ['ip', 'port', 'location']
    missing = [f for f in required if f not in data]

    if missing:
        return jsonify({'error': f'Missing fields: {", ".join(missing)}'}), 400

    if Device.query.filter_by(ip=data['ip']).first():
        return jsonify({'error': 'Device with this IP already exists'}), 409

    zk = ZK(
        data['ip'],
        port=data['port'],
        timeout=10,
        password=0,
        force_udp=False,
        ommit_ping=True
    )

    try:
        conn = zk.connect()
        if not conn:
            raise Exception("Connection returned None")
    except Exception as e:
        return jsonify({'error': f'Device not connected: {str(e)}'}), 400

    device = Device(
        ip=data['ip'],
        port=int(data['port']),
        location=data['location'],
        isActive=True
    )

    db.session.add(device)
    db.session.commit()

    return jsonify({
        'message': 'Device created',
        'device': {
            'id': device.id,
            'ip': device.ip,
            'port': device.port,
            'location': device.location,
            'isActive': device.isActive
        }
    }), 201

@devices_bp.route('/devices', methods=['GET'])
@token_required
def get_all_devices():
    devices = Device.query.all()
    results = []

    for device in devices:
        zk = ZK(
            device.ip,
            port=device.port,
            timeout=10,
            password=0,
            force_udp=False,
            ommit_ping=True
        )

        device_info = {
            'id': device.id,
            'ip': device.ip,
            'port': device.port,
            'location': device.location,
            'isActive': device.isActive,
            'users': None,
            'fingers': None,
            'records': None,
            'users_cap': None,
            'fingers_cap': None,
            'firmware_version': None,
            'serial_number': None,
            'platform': None,
            'device_name': None,
            'face_version': None,
            'fp_version': None,
            'extend_fmt': None,
            'user_extend_fmt': None,
            'face_fun_on': None,
            'compat_old_firmware': None,
            'network_params': None,
            'mac': None,
            'pin_width': None,
            'error': None
        }

        try:
            conn = zk.connect()
            if not conn:
                raise Exception("Connection returned None")

            if not conn.read_sizes():
                raise Exception("Failed to read sizes")

            device_info.update({
                'users': conn.users,
                'fingers': conn.fingers,
                'records': conn.records,
                'users_cap': conn.users_cap,
                'fingers_cap': conn.fingers_cap
            })

            try: device_info['firmware_version'] = conn.get_firmware_version()
            except: pass
            try: device_info['serial_number'] = conn.get_serialnumber()
            except: pass
            try: device_info['platform'] = conn.get_platform()
            except: pass
            try: device_info['device_name'] = conn.get_device_name()
            except: pass
            try: device_info['face_version'] = conn.get_face_version()
            except: pass
            try: device_info['fp_version'] = conn.get_fp_version()
            except: pass
            try: device_info['extend_fmt'] = conn.get_extend_fmt()
            except: pass
            try: device_info['user_extend_fmt'] = conn.get_user_extend_fmt()
            except: pass
            try: device_info['face_fun_on'] = conn.get_face_fun_on()
            except: pass
            try: device_info['compat_old_firmware'] = conn.get_compat_old_firmware()
            except: pass
            try: device_info['network_params'] = conn.get_network_params()
            except: pass
            try: device_info['mac'] = conn.get_mac()
            except: pass
            try: device_info['pin_width'] = conn.get_pin_width()
            except: pass

            conn.disconnect()

        except Exception as e:
            device_info['error'] = str(e)

        results.append(device_info)

    return jsonify(results)

@devices_bp.route('/devices/<int:device_id>', methods=['GET'])
@token_required
def get_device(device_id):
    device = Device.query.get(device_id)
    if not device:
        return jsonify({'error': 'Device not found'}), 404

    zk = ZK(
        device.ip,
        port=device.port,
        timeout=10,
        password=0,
        force_udp=False,
        ommit_ping=True
    )

    device_info = {
        'id': device.id,
        'ip': device.ip,
        'port': device.port,
        'location': device.location,
        'isActive': device.isActive,
        'users': None,
        'fingers': None,
        'records': None,
        'users_cap': None,
        'fingers_cap': None,
        'firmware_version': None,
        'serial_number': None,
        'platform': None,
        'device_name': None,
        'face_version': None,
        'fp_version': None,
        'extend_fmt': None,
        'user_extend_fmt': None,
        'face_fun_on': None,
        'compat_old_firmware': None,
        'network_params': None,
        'mac': None,
        'pin_width': None,
        'error': None
    }

    try:
        conn = zk.connect()
        if not conn:
            raise Exception("Connection returned None")

        if not conn.read_sizes():
            raise Exception("Failed to read sizes")

        # Basic info
        device_info.update({
            'users': conn.users,
            'fingers': conn.fingers,
            'records': conn.records,
            'users_cap': conn.users_cap,
            'fingers_cap': conn.fingers_cap
        })

        # Extended info
        try: device_info['firmware_version'] = conn.get_firmware_version()
        except: pass
        try: device_info['serial_number'] = conn.get_serialnumber()
        except: pass
        try: device_info['platform'] = conn.get_platform()
        except: pass
        try: device_info['device_name'] = conn.get_device_name()
        except: pass
        try: device_info['face_version'] = conn.get_face_version()
        except: pass
        try: device_info['fp_version'] = conn.get_fp_version()
        except: pass
        try: device_info['extend_fmt'] = conn.get_extend_fmt()
        except: pass
        try: device_info['user_extend_fmt'] = conn.get_user_extend_fmt()
        except: pass
        try: device_info['face_fun_on'] = conn.get_face_fun_on()
        except: pass
        try: device_info['compat_old_firmware'] = conn.get_compat_old_firmware()
        except: pass
        try: device_info['network_params'] = conn.get_network_params()
        except: pass
        try: device_info['mac'] = conn.get_mac()
        except: pass
        try: device_info['pin_width'] = conn.get_pin_width()
        except: pass

        conn.disconnect()

    except Exception as e:
        device_info['error'] = str(e)

    return jsonify(device_info)

@devices_bp.route('/devices/<int:device_id>', methods=['PUT'])
@token_required
def update_device(device_id):
    device = Device.query.get(device_id)
    if not device:
        return jsonify({'error': 'Device not found'}), 404

    data = request.get_json()
    for field in ['ip', 'port', 'location']:
        if field in data:
            setattr(device, field, data[field])

    zk = ZK(
        device.ip,
        port=int(device.port),
        timeout=10,
        password=0,
        force_udp=False,
        ommit_ping=True
    )

    try:
        conn = zk.connect()
        if not conn:
            raise Exception("Connection returned None")
        device.isActive = True
    except Exception as e:
        device.isActive = False
        return jsonify({'error': f'Failed to connect to device: {str(e)}'}), 400

    db.session.commit()

    return jsonify({
        'message': 'Device updated',
        'device': {
            'id': device.id,
            'ip': device.ip,
            'port': device.port,
            'location': device.location,
            'isActive': device.isActive
        }
    }), 201

@devices_bp.route('/devices/<int:device_id>', methods=['DELETE'])
@token_required
def delete_device(device_id):
    device = Device.query.get(device_id)
    if not device:
        return jsonify({'error': 'Device not found'}), 404

    db.session.delete(device)
    db.session.commit()
    return jsonify({'message': 'Device deleted'})
