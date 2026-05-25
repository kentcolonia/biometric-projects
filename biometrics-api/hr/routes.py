from flask import Blueprint, jsonify, request
from auth import token_required
from models.models import db, Company, Department, ShiftSchedule, Employee, AttendanceLog
from datetime import datetime, date, timedelta, time
from sqlalchemy import func

hr_bp = Blueprint('hr', __name__)


# ─── COMPANY ───────────────────────────────────────────────────────────────────

@hr_bp.route('/companies', methods=['GET'])
@token_required
def get_companies():
    companies = Company.query.order_by(Company.name).all()
    return jsonify({'data': [c.to_dict() for c in companies]}), 200

@hr_bp.route('/companies', methods=['POST'])
@token_required
def create_company():
    data = request.get_json()
    if not data.get('name'):
        return jsonify({'error': 'Name is required'}), 400
    company = Company(name=data['name'], address=data.get('address', ''))
    db.session.add(company)
    db.session.commit()
    return jsonify({'message': 'Company created', 'data': company.to_dict()}), 201

@hr_bp.route('/companies/<int:id>', methods=['PUT'])
@token_required
def update_company(id):
    company = Company.query.get(id)
    if not company:
        return jsonify({'error': 'Company not found'}), 404
    data = request.get_json()
    if 'name' in data: company.name = data['name']
    if 'address' in data: company.address = data['address']
    db.session.commit()
    return jsonify({'message': 'Company updated', 'data': company.to_dict()}), 200

@hr_bp.route('/companies/<int:id>', methods=['DELETE'])
@token_required
def delete_company(id):
    company = Company.query.get(id)
    if not company:
        return jsonify({'error': 'Company not found'}), 404
    db.session.delete(company)
    db.session.commit()
    return jsonify({'message': 'Company deleted'}), 200


# ─── DEPARTMENT ────────────────────────────────────────────────────────────────

@hr_bp.route('/departments', methods=['GET'])
@token_required
def get_departments():
    company_id = request.args.get('company_id')
    query = Department.query
    if company_id:
        query = query.filter_by(company_id=company_id)
    departments = query.order_by(Department.name).all()
    return jsonify({'data': [d.to_dict() for d in departments]}), 200

@hr_bp.route('/departments', methods=['POST'])
@token_required
def create_department():
    data = request.get_json()
    if not data.get('name'):
        return jsonify({'error': 'Name is required'}), 400
    if not data.get('company_id'):
        return jsonify({'error': 'Company is required'}), 400
    dept = Department(name=data['name'], company_id=data['company_id'])
    db.session.add(dept)
    db.session.commit()
    return jsonify({'message': 'Department created', 'data': dept.to_dict()}), 201

@hr_bp.route('/departments/<int:id>', methods=['PUT'])
@token_required
def update_department(id):
    dept = Department.query.get(id)
    if not dept:
        return jsonify({'error': 'Department not found'}), 404
    data = request.get_json()
    if 'name' in data: dept.name = data['name']
    if 'company_id' in data: dept.company_id = data['company_id']
    db.session.commit()
    return jsonify({'message': 'Department updated', 'data': dept.to_dict()}), 200

@hr_bp.route('/departments/<int:id>', methods=['DELETE'])
@token_required
def delete_department(id):
    dept = Department.query.get(id)
    if not dept:
        return jsonify({'error': 'Department not found'}), 404
    db.session.delete(dept)
    db.session.commit()
    return jsonify({'message': 'Department deleted'}), 200


# ─── SHIFT SCHEDULE ────────────────────────────────────────────────────────────

@hr_bp.route('/shifts', methods=['GET'])
@token_required
def get_shifts():
    company_id = request.args.get('company_id')
    query = ShiftSchedule.query
    if company_id:
        query = query.filter_by(company_id=company_id)
    shifts = query.order_by(ShiftSchedule.name).all()
    return jsonify({'data': [s.to_dict() for s in shifts]}), 200

@hr_bp.route('/shifts', methods=['POST'])
@token_required
def create_shift():
    data = request.get_json()
    required = ['name', 'time_in', 'time_out']
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({'error': f'Missing: {", ".join(missing)}'}), 400
    try:
        time_in = datetime.strptime(data['time_in'], '%H:%M').time()
        time_out = datetime.strptime(data['time_out'], '%H:%M').time()
    except ValueError:
        return jsonify({'error': 'Invalid time format, use HH:MM'}), 400

    break_start = None
    break_end = None
    has_break = bool(data.get('has_break', False))
    if has_break:
        try:
            break_start = datetime.strptime(data['break_start'], '%H:%M').time() if data.get('break_start') else None
            break_end   = datetime.strptime(data['break_end'],   '%H:%M').time() if data.get('break_end')   else None
        except ValueError:
            return jsonify({'error': 'Invalid break time format, use HH:MM'}), 400

    saturday_time_out = None
    if data.get('saturday_time_out'):
        try:
            saturday_time_out = datetime.strptime(data['saturday_time_out'], '%H:%M').time()
        except ValueError:
            return jsonify({'error': 'Invalid saturday_time_out format, use HH:MM'}), 400

    shift = ShiftSchedule(
        name=data['name'],
        time_in=time_in,
        time_out=time_out,
        break_start=break_start,
        break_end=break_end,
        has_break=has_break,
        saturday_time_out=saturday_time_out,
        grace_period=int(data.get('grace_period', 15)),
        is_night_shift=bool(data.get('is_night_shift', False)),
        company_id=data.get('company_id'),
    )
    db.session.add(shift)
    db.session.commit()
    return jsonify({'message': 'Shift created', 'data': shift.to_dict()}), 201

@hr_bp.route('/shifts/<int:id>', methods=['PUT'])
@token_required
def update_shift(id):
    shift = ShiftSchedule.query.get(id)
    if not shift:
        return jsonify({'error': 'Shift not found'}), 404
    data = request.get_json()
    if 'name' in data: shift.name = data['name']
    if 'grace_period' in data: shift.grace_period = int(data['grace_period'])
    if 'is_night_shift' in data: shift.is_night_shift = bool(data['is_night_shift'])
    if 'company_id' in data: shift.company_id = data['company_id']
    if 'has_break' in data: shift.has_break = bool(data['has_break'])
    if 'time_in' in data:
        shift.time_in = datetime.strptime(data['time_in'], '%H:%M').time()
    if 'time_out' in data:
        shift.time_out = datetime.strptime(data['time_out'], '%H:%M').time()
    if 'break_start' in data:
        shift.break_start = datetime.strptime(data['break_start'], '%H:%M').time() if data['break_start'] else None
    if 'break_end' in data:
        shift.break_end = datetime.strptime(data['break_end'], '%H:%M').time() if data['break_end'] else None
    if 'saturday_time_out' in data:
        shift.saturday_time_out = datetime.strptime(data['saturday_time_out'], '%H:%M').time() if data['saturday_time_out'] else None
    db.session.commit()
    return jsonify({'message': 'Shift updated', 'data': shift.to_dict()}), 200

@hr_bp.route('/shifts/<int:id>', methods=['DELETE'])
@token_required
def delete_shift(id):
    shift = ShiftSchedule.query.get(id)
    if not shift:
        return jsonify({'error': 'Shift not found'}), 404
    db.session.delete(shift)
    db.session.commit()
    return jsonify({'message': 'Shift deleted'}), 200


# ─── EMPLOYEE ──────────────────────────────────────────────────────────────────

@hr_bp.route('/employees', methods=['GET'])
@token_required
def get_employees():
    company_id = request.args.get('company_id')
    department_id = request.args.get('department_id')
    search = request.args.get('search')
    query = Employee.query
    if company_id:
        query = query.filter_by(company_id=company_id)
    if department_id:
        query = query.filter_by(department_id=department_id)
    if search:
        query = query.filter(
            (Employee.name.ilike(f'%{search}%')) |
            (Employee.user_id.ilike(f'%{search}%'))
        )
    employees = query.order_by(Employee.name).all()
    return jsonify({'data': [e.to_dict() for e in employees]}), 200

@hr_bp.route('/employees', methods=['POST'])
@token_required
def create_employee():
    data = request.get_json()
    if not data.get('user_id'):
        return jsonify({'error': 'user_id is required'}), 400
    if not data.get('name'):
        return jsonify({'error': 'name is required'}), 400
    if Employee.query.filter_by(user_id=data['user_id']).first():
        return jsonify({'error': f"Employee with user_id '{data['user_id']}' already exists"}), 409
    emp = Employee(
        user_id=data['user_id'],
        name=data['name'],
        email=data.get('email'),
        company_id=data.get('company_id'),
        department_id=data.get('department_id'),
        shift_id=data.get('shift_id'),
        is_active=data.get('is_active', True),
    )
    db.session.add(emp)
    db.session.commit()
    return jsonify({'message': 'Employee created', 'data': emp.to_dict()}), 201

@hr_bp.route('/employees/<int:id>', methods=['PUT'])
@token_required
def update_employee(id):
    emp = Employee.query.get(id)
    if not emp:
        return jsonify({'error': 'Employee not found'}), 404
    data = request.get_json()
    for field in ['name', 'email', 'company_id', 'department_id', 'shift_id', 'is_active']:
        if field in data:
            setattr(emp, field, data[field])
    if 'user_id' in data:
        existing = Employee.query.filter_by(user_id=data['user_id']).first()
        if existing and existing.id != id:
            return jsonify({'error': 'user_id already used by another employee'}), 409
        emp.user_id = data['user_id']
    db.session.commit()
    return jsonify({'message': 'Employee updated', 'data': emp.to_dict()}), 200

@hr_bp.route('/employees/<int:id>', methods=['DELETE'])
@token_required
def delete_employee(id):
    emp = Employee.query.get(id)
    if not emp:
        return jsonify({'error': 'Employee not found'}), 404
    db.session.delete(emp)
    db.session.commit()
    return jsonify({'message': 'Employee deleted'}), 200


# ─── ATTENDANCE REPORT ─────────────────────────────────────────────────────────

def compute_attendance(logs_for_day, shift, work_date):
    """
    Given a list of AttendanceLog for one employee on one day,
    compute late, absent, overtime, undertime.
    Returns a dict with all computed fields.
    """
    check_ins  = [l for l in logs_for_day if l.punch == 0]
    check_outs = [l for l in logs_for_day if l.punch == 1]

    # Find the earliest check-in and latest check-out logs (full objects for location)
    first_in_log  = min(check_ins,  key=lambda l: l.timestamp, default=None)
    last_out_log  = max(check_outs, key=lambda l: l.timestamp, default=None)

    first_in  = first_in_log.timestamp  if first_in_log  else None
    last_out  = last_out_log.timestamp  if last_out_log  else None

    def loc(log): return log.device.location if log and log.device and log.device.location else None

    result = {
        'date': work_date.isoformat(),
        'first_in': first_in.strftime('%H:%M:%S') if first_in else None,
        'last_out': last_out.strftime('%H:%M:%S') if last_out else None,
        'time_in_location':  loc(first_in_log),
        'time_out_location': loc(last_out_log),
        'is_absent': first_in is None,
        'is_late': False,
        'late_minutes': 0,
        'is_undertime': False,
        'undertime_minutes': 0,
        'is_overtime': False,
        'overtime_minutes': 0,
        'hours_worked': 0,
    }

    if not shift:
        return result

    # Saturday half-day: use saturday_time_out if set, skip if None (no work)
    is_saturday = work_date.weekday() == 5
    if is_saturday:
        if shift.saturday_time_out is None:
            # No Saturday work defined — mark as absent if no logs
            result['is_absent'] = first_in is None
            return result
        effective_time_out = shift.saturday_time_out
    else:
        effective_time_out = shift.time_out

    shift_in  = datetime.combine(work_date, shift.time_in)
    shift_out = datetime.combine(work_date, effective_time_out)

    # Night shift: shift_out is next day
    if shift.is_night_shift and effective_time_out < shift.time_in:
        shift_out += timedelta(days=1)

    grace_cutoff = shift_in + timedelta(minutes=shift.grace_period)

    if first_in:
        # Late
        if first_in > grace_cutoff:
            late_mins = int((first_in - shift_in).total_seconds() / 60)
            result['is_late'] = True
            result['late_minutes'] = late_mins

        if last_out:
            worked_seconds = (last_out - first_in).total_seconds()
            result['hours_worked'] = round(worked_seconds / 3600, 2)

            # Undertime
            if last_out < shift_out:
                ut_mins = int((shift_out - last_out).total_seconds() / 60)
                result['is_undertime'] = True
                result['undertime_minutes'] = ut_mins

            # Overtime
            if last_out > shift_out:
                ot_mins = int((last_out - shift_out).total_seconds() / 60)
                result['is_overtime'] = True
                result['overtime_minutes'] = ot_mins

    return result


@hr_bp.route('/reports/attendance', methods=['GET'])
@token_required
def attendance_report():
    date_from_str = request.args.get('date_from')
    date_to_str   = request.args.get('date_to')
    employee_id   = request.args.get('employee_id')
    company_id    = request.args.get('company_id')
    department_id = request.args.get('department_id')
    period        = request.args.get('period', 'daily')  # daily|weekly|monthly

    if not date_from_str or not date_to_str:
        return jsonify({'error': 'date_from and date_to are required'}), 400

    try:
        date_from = datetime.strptime(date_from_str, '%Y-%m-%d').date()
        date_to   = datetime.strptime(date_to_str,   '%Y-%m-%d').date()
    except ValueError:
        return jsonify({'error': 'Invalid date format, use YYYY-MM-DD'}), 400

    # Get employees
    emp_query = Employee.query.filter_by(is_active=True)
    if employee_id:
        emp_query = emp_query.filter_by(id=employee_id)
    if company_id:
        emp_query = emp_query.filter_by(company_id=company_id)
    if department_id:
        emp_query = emp_query.filter_by(department_id=department_id)
    employees = emp_query.all()

    if not employees:
        return jsonify({'data': [], 'summary': {}}), 200

    # Get all logs in range for these employees
    user_ids = [e.user_id for e in employees]
    dt_from = datetime.combine(date_from, time(0, 0, 0))
    dt_to   = datetime.combine(date_to,   time(23, 59, 59))

    from sqlalchemy.orm import joinedload as _jl
    all_logs = AttendanceLog.query.options(_jl(AttendanceLog.device)).filter(
        AttendanceLog.user_id.in_(user_ids),
        AttendanceLog.timestamp >= dt_from,
        AttendanceLog.timestamp <= dt_to,
    ).all()

    # Group logs by user_id → date
    from collections import defaultdict
    logs_by_user_date = defaultdict(lambda: defaultdict(list))
    for log in all_logs:
        log_date = log.timestamp.date()
        logs_by_user_date[log.user_id][log_date].append(log)

    # Build date range
    all_dates = []
    cur = date_from
    while cur <= date_to:
        all_dates.append(cur)
        cur += timedelta(days=1)

    report = []
    total_late = total_absent = total_ot = total_ut = 0

    for emp in employees:
        emp_records = []
        for d in all_dates:
            day_logs = logs_by_user_date[emp.user_id].get(d, [])
            rec = compute_attendance(day_logs, emp.shift, d)
            rec['employee_id'] = emp.id
            rec['user_id'] = emp.user_id
            rec['employee_name'] = emp.name
            rec['department'] = emp.department.name if emp.department else None
            rec['company'] = emp.company.name if emp.company else None
            rec['shift'] = emp.shift.name if emp.shift else None
            rec['shift_time_in'] = emp.shift.time_in.strftime('%H:%M') if emp.shift else None
            rec['shift_time_out'] = emp.shift.time_out.strftime('%H:%M') if emp.shift else None
            emp_records.append(rec)

            if rec['is_absent']:    total_absent += 1
            if rec['is_late']:      total_late   += 1
            if rec['is_overtime']:  total_ot     += 1
            if rec['is_undertime']: total_ut     += 1

        report.append({
            'employee': emp.to_dict(),
            'records': emp_records,
            'summary': {
                'total_days':      len(all_dates),
                'present':         sum(1 for r in emp_records if not r['is_absent']),
                'absent':          sum(1 for r in emp_records if r['is_absent']),
                'late':            sum(1 for r in emp_records if r['is_late']),
                'late_minutes':    sum(r['late_minutes'] for r in emp_records),
                'undertime':       sum(1 for r in emp_records if r['is_undertime']),
                'undertime_minutes': sum(r['undertime_minutes'] for r in emp_records),
                'overtime':        sum(1 for r in emp_records if r['is_overtime']),
                'overtime_minutes': sum(r['overtime_minutes'] for r in emp_records),
                'total_hours':     round(sum(r['hours_worked'] for r in emp_records), 2),
            }
        })

    return jsonify({
        'date_from': date_from_str,
        'date_to': date_to_str,
        'period': period,
        'data': report,
        'overall_summary': {
            'total_employees': len(employees),
            'total_absent': total_absent,
            'total_late': total_late,
            'total_overtime': total_ot,
            'total_undertime': total_ut,
        }
    }), 200