from flask import Blueprint, jsonify, request
from auth import token_required
from models.models import db, AttendanceLog, Device
from sqlalchemy.orm import joinedload
from datetime import datetime

logs_bp = Blueprint('logs', __name__)


@logs_bp.route('/logs', methods=['GET'])
@token_required
def get_all_logs():
    try:
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 50))
    except ValueError:
        return jsonify({"error": "Invalid pagination parameters"}), 400

    location = request.args.get('location')
    user_id = request.args.get('user_id')
    date_from = request.args.get('date_from')   # YYYY-MM-DD
    date_to = request.args.get('date_to')       # YYYY-MM-DD
    punch = request.args.get('punch')           # 0 or 1

    query = AttendanceLog.query.options(joinedload(AttendanceLog.device))

    if location:
        query = query.join(Device).filter(Device.location == location)

    if user_id:
        query = query.filter(AttendanceLog.user_id.ilike(f'%{user_id}%'))

    if date_from:
        try:
            query = query.filter(AttendanceLog.timestamp >= datetime.strptime(date_from, '%Y-%m-%d'))
        except ValueError:
            return jsonify({"error": "Invalid date_from format, use YYYY-MM-DD"}), 400

    if date_to:
        try:
            dt_to = datetime.strptime(date_to, '%Y-%m-%d').replace(hour=23, minute=59, second=59)
            query = query.filter(AttendanceLog.timestamp <= dt_to)
        except ValueError:
            return jsonify({"error": "Invalid date_to format, use YYYY-MM-DD"}), 400

    if punch is not None and punch != '':
        query = query.filter(AttendanceLog.punch == int(punch))

    total = query.count()
    logs = query.order_by(AttendanceLog.timestamp.desc()) \
                .offset((page - 1) * limit).limit(limit).all()

    return jsonify({
        "page": page,
        "limit": limit,
        "total": total,
        "total_pages": (total + limit - 1) // limit,
        "data": [{
            **log.to_dict(),
            "location": log.device.location if log.device else None,
            "device_ip": log.device.ip if log.device else None,
        } for log in logs]
    }), 200


@logs_bp.route('/logs/locations', methods=['GET'])
@token_required
def get_log_locations():
    """Return distinct locations that have logs — for the filter dropdown."""
    devices = Device.query.all()
    locations = [{"id": d.id, "location": d.location, "ip": d.ip} for d in devices]
    return jsonify({"data": locations}), 200


@logs_bp.route('/logs/<int:log_id>', methods=['GET'])
@token_required
def get_log(log_id):
    log = AttendanceLog.query.get(log_id)
    if not log:
        return jsonify({'error': 'Log not found'}), 404
    return jsonify(log.to_dict()), 200


@logs_bp.route('/logs/<int:log_id>', methods=['PUT'])
@token_required
def update_log(log_id):
    log = AttendanceLog.query.get(log_id)
    if not log:
        return jsonify({'error': 'Log not found'}), 404

    data = request.get_json()
    for field in ['uid', 'user_id', 'timestamp', 'status', 'punch']:
        if field in data:
            if field == 'timestamp':
                try:
                    setattr(log, field, datetime.fromisoformat(data[field]))
                except ValueError:
                    return jsonify({'error': 'Invalid timestamp format'}), 400
            else:
                setattr(log, field, data[field])

    db.session.commit()
    return jsonify({'message': 'Log updated', 'log': log.to_dict()}), 200


@logs_bp.route('/logs/<int:log_id>', methods=['DELETE'])
@token_required
def delete_log(log_id):
    log = AttendanceLog.query.get(log_id)
    if not log:
        return jsonify({'error': 'Log not found'}), 404

    db.session.delete(log)
    db.session.commit()
    return jsonify({'message': 'Log deleted'}), 200