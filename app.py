from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from flask_bcrypt import Bcrypt
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity, get_jwt
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
    role = db.Column(db.String(20), nullable=False, default='viewer')
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
    assigned_role = 'admin' if data['username'].lower(
    ) == 'tejas' else 'viewer'

    new_user = User(username=data['username'],
                    password_hash=hashed_password, role=assigned_role)
    db.session.add(new_user)
    db.session.commit()

    return jsonify({"message": f"User created successfully as {assigned_role}!"}), 201


@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    user = User.query.filter_by(username=data.get('username')).first()

    if user and bcrypt.check_password_hash(user.password_hash, data.get('password')):
        access_token = create_access_token(
            identity=str(user.id),
            additional_claims={"role": user.role}
        )

        return jsonify({
            "message": "Login successful",
            "access_token": access_token,
            "role": user.role
        }), 200

    return jsonify({"error": "Invalid username or password"}), 401


@app.route('/tasks', methods=['GET'])
@jwt_required()
def get_tasks():
    tasks = Task.query.all()
    tasks_list = [{"id": task.id, "title": task.title,
                   "done": task.done} for task in tasks]
    return jsonify({"tasks": tasks_list})


@app.route('/tasks', methods=['POST'])
@jwt_required()
def create_task():
    claims = get_jwt()
    if claims.get("role") != "admin":
        return jsonify({"error": "Admin access required"}), 403

    current_user_id = get_jwt_identity()
    data = request.get_json()

    new_task = Task(title=data['title'], user_id=current_user_id)
    db.session.add(new_task)
    db.session.commit()

    return jsonify({"id": new_task.id, "title": new_task.title, "done": new_task.done}), 201


@app.route('/tasks/<int:id>', methods=['PUT'])
@jwt_required()
def update_task(id):
    claims = get_jwt()
    user_role = claims.get("role")   
    task = db.get_or_404(Task, id)
    data = request.get_json()
    if user_role != "admin":
        if 'title' in data:
            return jsonify({"error": "Only admins can edit task titles"}), 403
        if 'done' in data:
            task.done = data['done']
            
    else:
        if 'title' in data: 
            task.title = data['title']
        if 'done' in data: 
            task.done = data['done']
            
    db.session.commit()
    return jsonify({"id": task.id, "title": task.title, "done": task.done})


@app.route('/tasks/<int:id>', methods=['DELETE'])
@jwt_required()
def delete_task(id):
    claims = get_jwt()
    if claims.get("role") != "admin":
        return jsonify({"error": "Admin access required"}), 403

    task = db.get_or_404(Task, id)
    db.session.delete(task)
    db.session.commit()
    return jsonify({"message": "Task deleted"})


if __name__ == "__main__":
    app.run(debug=True)
