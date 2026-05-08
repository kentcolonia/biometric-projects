import jwt
from flask import request, jsonify
from datetime import datetime, timedelta
from functools import wraps
from config import SECRET_KEY, TOKEN_EXPIRATION_MINUTES, VALID_USERNAME, VALID_PASSWORD

def generate_token(username):
    payload = {
        'user': username,
        'exp': datetime.utcnow() + timedelta(minutes=TOKEN_EXPIRATION_MINUTES)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm='HS256')

def verify_token(token):
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith("Bearer "):
            return jsonify({'error': 'Token missing'}), 401

        token = auth_header.split(" ")[1]
        if not verify_token(token):
            return jsonify({'error': 'Invalid or expired token'}), 401

        return f(*args, **kwargs)
    return decorated

def authenticate_user(username, password):
    return username == VALID_USERNAME and password == VALID_PASSWORD
