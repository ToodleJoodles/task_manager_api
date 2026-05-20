from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from flask_bcrypt import Bcrypt
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from datetime import timedelta

app = Flask(__name__)
CORS(app)

app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///app.db'
app.config['JWT_SECRET_KEY'] = '7f8a9b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a'
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(hours=1)

db = SQLAlchemy(app)
bcrypt = Bcrypt(app)
jwt = JWTManager(app)


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)

    tasks = db.relationship('Task', backref='author', lazy=True)


class Task(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    done = db.Column(db.Boolean, default=False)

    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)


with app.app_context():
    db.create_all()


@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()

    if not data or not data.get('username') or not data.get('password'):
        return jsonify({"error": "Username and password required"}), 400

    if User.query.filter_by(username=data['username']).first():
        return jsonify({"error": "Username already taken"}), 400

    hashed_password = bcrypt.generate_password_hash(
        data['password']).decode('utf-8')

    new_user = User(username=data['username'], password_hash=hashed_password)

    db.session.add(new_user)
    db.session.commit()

    return jsonify({"message": "User created successfully!"}), 201


@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()

    user = User.query.filter_by(username=data.get('username')).first()

    if user and bcrypt.check_password_hash(user.password_hash, data.get('password')):

        access_token = create_access_token(identity=str(user.id))

        return jsonify({
            "message": "Login successful",
            "access_token": access_token
        }), 200

    return jsonify({"error": "Invalid username or password"}), 401


@app.route('/tasks', methods=['GET'])
@jwt_required()
def get_tasks():
    current_user_id = get_jwt_identity()

    tasks = Task.query.filter_by(user_id=current_user_id).all()

    tasks_list = [{"id": task.id, "title": task.title,
                   "done": task.done} for task in tasks]
    return jsonify({"tasks": tasks_list})


@app.route('/tasks', methods=['POST'])
@jwt_required()
def create_task():
    current_user_id = get_jwt_identity()
    data = request.get_json()

    new_task = Task(title=data['title'], user_id=current_user_id)
    db.session.add(new_task)
    db.session.commit()

    return jsonify({"id": new_task.id, "title": new_task.title, "done": new_task.done}), 201


@app.route('/tasks/<int:id>', methods=['PUT'])
@jwt_required()
def update_task(id):
    current_user_id = get_jwt_identity()

    task = Task.query.filter_by(id=id, user_id=current_user_id).first()

    if not task:
        return jsonify({"error": "Task not found or unauthorized"}), 404

    data = request.get_json()
    if 'title' in data:
        task.title = data['title']
    if 'done' in data:
        task.done = data['done']

    db.session.commit()
    return jsonify({"id": task.id, "title": task.title, "done": task.done})


@app.route('/tasks/<int:id>', methods=['DELETE'])
@jwt_required()
def delete_task(id):
    current_user_id = get_jwt_identity()

    task = Task.query.filter_by(id=id, user_id=current_user_id).first()

    if not task:
        return jsonify({"error": "Task not found or unauthorized"}), 404

    db.session.delete(task)
    db.session.commit()
    return jsonify({"message": "Task deleted"})


if __name__ == "__main__":
    app.run(debug=True)
