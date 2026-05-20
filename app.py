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


@app.route("/tasks", methods=["GET"])
def get_all_tasks():
    all_tasks = Task.query.all()

    task_list = [task.to_dict() for task in all_tasks]

    return jsonify({"tasks": task_list})


@app.route("/tasks/<int:task_id>", methods=["GET"])
def get_single_task(task_id):
    task = Task.query.get(task_id)

    if task:
        return jsonify(task.to_dict())
    else:
        return jsonify({"error": "Task not found"}), 404


@app.route("/tasks", methods=["POST"])
def create_task():
    data = request.get_json()

    new_task = Task(title=data["title"])

    db.session.add(new_task)

    db.session.commit()

    return jsonify(new_task.to_dict()), 201


@app.route('/tasks/<int:id>', methods=['PUT'])
def update_task(id):

    task = db.get_or_404(Task, id)

    data = request.get_json()

    if 'title' in data:
        task.title = data['title']
    if 'done' in data:
        task.done = data['done']

    db.session.commit()

    return jsonify({'id': task.id, 'title': task.title, 'done': task.done}), 200


@app.route('/tasks/<int:id>', methods=['DELETE'])
def delete_task(id):

    task = db.get_or_404(Task, id)

    db.session.delete(task)

    db.session.commit()

    return jsonify({'message': 'Task deleted successfully'}), 200


if __name__ == "__main__":
    app.run(debug=True)
