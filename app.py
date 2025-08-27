from flask import Flask, render_template, request, session
from flask_socketio import SocketIO, emit, join_room, leave_room
import uuid
import random
import os

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key-here')
socketio = SocketIO(app, cors_allowed_origins="*")

# Хранилище пользователей и комнат
users = {}
waiting_users = []
rooms = {}

@app.route('/')
def index():
    session['user_id'] = str(uuid.uuid4())
    return render_template('index.html')

@socketio.on('connect')
def handle_connect():
    user_id = session.get('user_id')
    users[user_id] = {
        'sid': request.sid,
        'username': 'Anonymous',
        'in_call': False
    }
    print(f'User {user_id} connected')
    emit('connection_established')

@socketio.on('disconnect')
def handle_disconnect():
    user_id = session.get('user_id')
    if user_id in users:
        if user_id in waiting_users:
            waiting_users.remove(user_id)
        
        user_data = users[user_id]
        if user_data['in_call']:
            for room_id, room_users in rooms.items():
                if user_id in room_users:
                    leave_room(room_id)
                    room_users.remove(user_id)
                    if len(room_users) == 1:
                        remaining_user = room_users[0]
                        emit('partner_left', room=users[remaining_user]['sid'])
                    elif len(room_users) == 0:
                        del rooms[room_id]
                    break
        
        del users[user_id]
    print(f'User {user_id} disconnected')

@socketio.on('set_username')
def handle_set_username(data):
    user_id = session.get('user_id')
    if user_id in users:
        users[user_id]['username'] = data['username']
        emit('username_set', {'username': data['username']})

@socketio.on('start_search')
def handle_start_search():
    user_id = session.get('user_id')
    if user_id not in waiting_users and not users[user_id]['in_call']:
        waiting_users.append(user_id)
        users[user_id]['in_call'] = False
        
        if len(waiting_users) >= 2:
            user1_id = waiting_users.pop(0)
            user2_id = waiting_users.pop(0)
            
            room_id = str(uuid.uuid4())
            rooms[room_id] = [user1_id, user2_id]
            
            users[user1_id]['in_call'] = True
            users[user2_id]['in_call'] = True
            
            join_room(room_id, users[user1_id]['sid'])
            join_room(room_id, users[user2_id]['sid'])
            
            emit('call_started', {
                'partner_username': users[user2_id]['username'],
                'room_id': room_id
            }, room=users[user1_id]['sid'])
            
            emit('call_started', {
                'partner_username': users[user1_id]['username'],
                'room_id': room_id
            }, room=users[user2_id]['sid'])
        else:
            emit('waiting_for_partner')

@socketio.on('stop_search')
def handle_stop_search():
    user_id = session.get('user_id')
    if user_id in waiting_users:
        waiting_users.remove(user_id)
        users[user_id]['in_call'] = False
        emit('search_stopped')

@socketio.on('end_call')
def handle_end_call():
    user_id = session.get('user_id')
    user_data = users[user_id]
    
    if user_data['in_call']:
        for room_id, room_users in rooms.items():
            if user_id in room_users:
                partner_id = next((uid for uid in room_users if uid != user_id), None)
                if partner_id:
                    emit('partner_left', room=users[partner_id]['sid'])
                
                room_users.remove(user_id)
                leave_room(room_id)
                user_data['in_call'] = False
                
                if len(room_users) == 0:
                    del rooms[room_id]
                break

@socketio.on('webrtc_offer')
def handle_webrtc_offer(data):
    user_id = session.get('user_id')
    user_data = users[user_id]
    
    if user_data['in_call']:
        for room_id, room_users in rooms.items():
            if user_id in room_users:
                partner_id = next((uid for uid in room_users if uid != user_id), None)
                if partner_id:
                    emit('webrtc_offer', {
                        'offer': data['offer'],
                        'from': user_id
                    }, room=users[partner_id]['sid'])

@socketio.on('webrtc_answer')
def handle_webrtc_answer(data):
    user_id = session.get('user_id')
    user_data = users[user_id]
    
    if user_data['in_call']:
        for room_id, room_users in rooms.items():
            if user_id in room_users:
                partner_id = next((uid for uid in room_users if uid != user_id), None)
                if partner_id:
                    emit('webrtc_answer', {
                        'answer': data['answer'],
                        'from': user_id
                    }, room=users[partner_id]['sid'])

@socketio.on('ice_candidate')
def handle_ice_candidate(data):
    user_id = session.get('user_id')
    user_data = users[user_id]
    
    if user_data['in_call']:
        for room_id, room_users in rooms.items():
            if user_id in room_users:
                partner_id = next((uid for uid in room_users if uid != user_id), None)
                if partner_id:
                    emit('ice_candidate', {
                        'candidate': data['candidate'],
                        'from': user_id
                    }, room=users[partner_id]['sid'])

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'False').lower() == 'true'
    socketio.run(app, debug=debug, host='0.0.0.0', port=port)
