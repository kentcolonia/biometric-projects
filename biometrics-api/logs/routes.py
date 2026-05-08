from flask import Blueprint, jsonify, request
from auth import token_required
from models.models import db, AttendanceLog, Device
from sqlalchemy.orm import joinedload

logs_bp = Blueprint('logs', __name__)

@logs_bp.route('/logs', methods=['GET'])
@token_required
def get_all_logs_grouped_by_location_with_limit():
    try:
        limit = int(request.args.get('limit', 10))  
    except ValueError:
        return jsonify({"error": "Invalid limit parameter"}), 400

    filter_location = request.args.get('location')

    query = AttendanceLog.query.options(joinedload(AttendanceLog.device))

    if filter_location:
        query = query.join(Device).filter(Device.location == filter_location)

    logs = query.order_by(AttendanceLog.timestamp.desc()).all()

    grouped_logs = {}

    for log in logs:
        location = log.device.location

        if location not in grouped_logs:
            grouped_logs[location] = {
                "location": location,
                "logs": []
            }

        if len(grouped_logs[location]["logs"]) < limit:
            grouped_logs[location]["logs"].append(log.to_dict())

    return jsonify({
        "limit": limit,
        "devices": list(grouped_logs.values())
    }), 200

# @logs_bp.route('/logs', methods=['GET'])
# @token_required
# def get_all_logs():
#     try:
#         page = int(request.args.get('page', 0))
#         limit = int(request.args.get('limit', 10))
#     except ValueError:
#         return jsonify({"error": "Invalid pagination parameters"}), 400

#     location = request.args.get('location')

#     query = AttendanceLog.query

#     if location:
#         query = query.filter(AttendanceLog.location == location)

#     total = query.count()

#     offset = (page - 0) * limit

#     logs = query.offset(offset).limit(limit).all()

#     return jsonify({
#         "page": page,
#         "limit": limit,
#         "total": total,
#         "data": [log.to_dict() for log in logs]
#     }), 200

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
