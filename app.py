from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from flask_bcrypt import Bcrypt
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from datetime import datetime, timezone, timedelta
import os


app = Flask(__name__)
CORS(app)

app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get(
    'DATABASE_URL', 'sqlite:///app.db')
app.config['JWT_SECRET_KEY'] = '7f8a9b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a'
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(hours=1)

db = SQLAlchemy(app)
bcrypt = Bcrypt(app)
jwt = JWTManager(app)

ROLE_ADMIN = 'admin'
ROLE_SUPERVISOR = 'supervisor'
ROLE_EMPLOYEE = 'employee'
VALID_ROLES = {ROLE_ADMIN, ROLE_SUPERVISOR, ROLE_EMPLOYEE}

supervisor_employee = db.Table(
    'supervisor_employee',
    db.Column('supervisor_id', db.Integer,
              db.ForeignKey('user.id'), primary_key=True),
    db.Column('employee_id', db.Integer,
              db.ForeignKey('user.id'), primary_key=True)
)


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    role = db.Column(db.String(20), nullable=False, default=ROLE_EMPLOYEE)
    assigned_employees = db.relationship(
        'User',
        secondary=supervisor_employee,
        primaryjoin=id == supervisor_employee.c.supervisor_id,
        secondaryjoin=id == supervisor_employee.c.employee_id,
        backref=db.backref('supervisors', lazy='dynamic'),
        lazy='dynamic'
    )
    created_tasks = db.relationship(
        'Task',
        foreign_keys='Task.created_by_id',
        backref='creator',
        lazy=True
    )
    assigned_tasks = db.relationship(
        'Task',
        foreign_keys='Task.assigned_to_id',
        backref='assignee',
        lazy=True
    )


class Task(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    done = db.Column(db.Boolean, default=False)
    deadline = db.Column(db.DateTime, nullable=False)
    completed_at = db.Column(db.DateTime, nullable=True)
    created_by_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    assigned_to_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)


def parse_datetime(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        return None


def serialize_user(user, include_relationships=False):
    user_data = {
        "id": user.id,
        "username": user.username,
        "role": user.role
    }

    if include_relationships:
        user_data["assigned_employees"] = [
            serialize_user(employee)
            for employee in user.assigned_employees.all()
        ]
        user_data["supervisors"] = [
            serialize_user(supervisor)
            for supervisor in user.supervisors.all()
        ]

    return user_data


def serialize_task(task):
    now = datetime.now(timezone.utc)
    deadline = task.deadline
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)

    completed_at = task.completed_at
    if completed_at and completed_at.tzinfo is None:
        completed_at = completed_at.replace(tzinfo=timezone.utc)

    return {
        "id": task.id,
        "title": task.title,
        "done": task.done,
        "deadline": task.deadline.isoformat(),
        "completed_at": task.completed_at.isoformat() if task.completed_at else None,
        "is_overdue": not task.done and deadline < now,
        "completed_late": bool(completed_at and completed_at > deadline),
        "created_by": serialize_user(task.creator),
        "assigned_to": serialize_user(task.assignee)
    }


def get_current_user():
    user_id = get_jwt_identity()
    if not user_id:
        return None
    return db.session.get(User, int(user_id))


def require_role(user, *roles):
    if not user or user.role not in roles:
        return False
    return True


def supervisor_has_employee(supervisor, employee):
    return supervisor.assigned_employees.filter_by(id=employee.id).first() is not None


def set_task_done_status(task, done):
    task.done = done
    if done:
        task.completed_at = datetime.now(timezone.utc)
    else:
        task.completed_at = None


def admin_required():
    current_user = get_current_user()
    if not require_role(current_user, ROLE_ADMIN):
        return None, (jsonify({"error": "Admin access required"}), 403)
    return current_user, None


def clear_user_relationships_for_role_change(user):
    for employee in user.assigned_employees.all():
        user.assigned_employees.remove(employee)
    for supervisor in user.supervisors.all():
        supervisor.assigned_employees.remove(user)


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
    assigned_role = ROLE_ADMIN if data['username'].lower(
    ) == ROLE_ADMIN else ROLE_EMPLOYEE

    new_user = User(username=data['username'],
                    password_hash=hashed_password, role=assigned_role)
    db.session.add(new_user)
    db.session.commit()

    return jsonify({"message": f"User created successfully as {assigned_role}!"}), 201


@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({"error": "Username and password required"}), 400

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


@app.route('/users', methods=['GET'])
@jwt_required()
def get_users():
    _, error_response = admin_required()
    if error_response:
        return error_response

    users = User.query.order_by(User.username).all()
    return jsonify({
        "users": [serialize_user(user, include_relationships=True) for user in users]
    })


@app.route('/users/<int:user_id>/role', methods=['PUT'])
@jwt_required()
def update_user_role(user_id):
    current_user, error_response = admin_required()
    if error_response:
        return error_response

    target_user = db.get_or_404(User, user_id)
    data = request.get_json()
    if not data or not data.get('role'):
        return jsonify({"error": "Role is required"}), 400

    new_role = data['role']
    assignable_roles = {ROLE_SUPERVISOR, ROLE_EMPLOYEE}
    if new_role not in assignable_roles:
        return jsonify({"error": "Role must be supervisor or employee"}), 400

    if target_user.id == current_user.id or target_user.role == ROLE_ADMIN:
        return jsonify({"error": "The admin account role cannot be changed"}), 403

    if target_user.role != new_role:
        clear_user_relationships_for_role_change(target_user)
        target_user.role = new_role

    db.session.commit()
    return jsonify(serialize_user(target_user, include_relationships=True))


@app.route('/supervisors/<int:supervisor_id>/employees', methods=['GET'])
@jwt_required()
def get_supervisor_employees(supervisor_id):
    _, error_response = admin_required()
    if error_response:
        return error_response

    supervisor = db.get_or_404(User, supervisor_id)
    if supervisor.role != ROLE_SUPERVISOR:
        return jsonify({"error": "Selected user is not a supervisor"}), 400

    return jsonify({
        "supervisor": serialize_user(supervisor),
        "employees": [
            serialize_user(employee)
            for employee in supervisor.assigned_employees.order_by(User.username).all()
        ]
    })


@app.route('/supervisors/<int:supervisor_id>/employees/<int:employee_id>', methods=['POST'])
@jwt_required()
def assign_employee_to_supervisor(supervisor_id, employee_id):
    _, error_response = admin_required()
    if error_response:
        return error_response

    supervisor = db.get_or_404(User, supervisor_id)
    employee = db.get_or_404(User, employee_id)

    if supervisor.role != ROLE_SUPERVISOR:
        return jsonify({"error": "Selected supervisor_id must belong to a supervisor"}), 400
    if employee.role != ROLE_EMPLOYEE:
        return jsonify({"error": "Selected employee_id must belong to an employee"}), 400
    if supervisor.id == employee.id:
        return jsonify({"error": "A user cannot supervise themselves"}), 400

    if not supervisor_has_employee(supervisor, employee):
        supervisor.assigned_employees.append(employee)
        db.session.commit()

    return jsonify({
        "message": "Employee assigned to supervisor",
        "supervisor": serialize_user(supervisor, include_relationships=True)
    })


@app.route('/supervisors/<int:supervisor_id>/employees/<int:employee_id>', methods=['DELETE'])
@jwt_required()
def remove_employee_from_supervisor(supervisor_id, employee_id):
    _, error_response = admin_required()
    if error_response:
        return error_response

    supervisor = db.get_or_404(User, supervisor_id)
    employee = db.get_or_404(User, employee_id)

    if supervisor.role != ROLE_SUPERVISOR:
        return jsonify({"error": "Selected supervisor_id must belong to a supervisor"}), 400
    if employee.role != ROLE_EMPLOYEE:
        return jsonify({"error": "Selected employee_id must belong to an employee"}), 400

    if supervisor_has_employee(supervisor, employee):
        supervisor.assigned_employees.remove(employee)
        db.session.commit()

    return jsonify({
        "message": "Employee removed from supervisor",
        "supervisor": serialize_user(supervisor, include_relationships=True)
    })


@app.route('/my-employees', methods=['GET'])
@jwt_required()
def get_my_employees():
    current_user = get_current_user()
    if not require_role(current_user, ROLE_SUPERVISOR):
        return jsonify({"error": "Supervisor access required"}), 403

    employees = current_user.assigned_employees.order_by(User.username).all()
    return jsonify({
        "employees": [serialize_user(employee) for employee in employees]
    })


@app.route('/tasks', methods=['GET'])
@jwt_required()
def get_tasks():
    current_user = get_current_user()
    if not current_user:
        return jsonify({"error": "User not found"}), 404

    if current_user.role == ROLE_ADMIN:
        tasks = Task.query.all()
    elif current_user.role == ROLE_SUPERVISOR:
        tasks = Task.query.filter_by(created_by_id=current_user.id).all()
    else:
        tasks = Task.query.filter_by(assigned_to_id=current_user.id).all()

    tasks_list = [serialize_task(task) for task in tasks]
    return jsonify({"tasks": tasks_list})


@app.route('/tasks', methods=['POST'])
@jwt_required()
def create_task():
    current_user = get_current_user()
    if not require_role(current_user, ROLE_SUPERVISOR):
        return jsonify({"error": "Supervisor access required"}), 403

    data = request.get_json()
    if not data or not data.get('title') or not data.get('assigned_to_id') or not data.get('deadline'):
        return jsonify({"error": "Title, assigned_to_id, and deadline are required"}), 400

    employee = db.session.get(User, data['assigned_to_id'])
    if not employee or employee.role != ROLE_EMPLOYEE:
        return jsonify({"error": "Assigned user must be an employee"}), 400

    if not supervisor_has_employee(current_user, employee):
        return jsonify({"error": "Employee is not assigned to this supervisor"}), 403

    deadline = parse_datetime(data['deadline'])
    if not deadline:
        return jsonify({"error": "Deadline must be a valid ISO date/time"}), 400

    new_task = Task(
        title=data['title'],
        deadline=deadline,
        created_by_id=current_user.id,
        assigned_to_id=employee.id
    )
    db.session.add(new_task)
    db.session.commit()

    return jsonify(serialize_task(new_task)), 201


@app.route('/tasks/<int:id>', methods=['PUT'])
@jwt_required()
def update_task(id):
    current_user = get_current_user()
    if not current_user:
        return jsonify({"error": "User not found"}), 404

    task = db.get_or_404(Task, id)
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required"}), 400

    if current_user.role == ROLE_EMPLOYEE:
        if task.assigned_to_id != current_user.id:
            return jsonify({"error": "You can only update your assigned tasks"}), 403
        if set(data.keys()) != {'done'}:
            return jsonify({"error": "Employees can only update done status"}), 403
        set_task_done_status(task, bool(data['done']))

    elif current_user.role == ROLE_SUPERVISOR:
        if task.created_by_id != current_user.id:
            return jsonify({"error": "You can only edit tasks you created"}), 403
        if 'title' in data:
            task.title = data['title']
        if 'deadline' in data:
            deadline = parse_datetime(data['deadline'])
            if not deadline:
                return jsonify({"error": "Deadline must be a valid ISO date/time"}), 400
            task.deadline = deadline
        if 'assigned_to_id' in data:
            employee = db.session.get(User, data['assigned_to_id'])
            if not employee or employee.role != ROLE_EMPLOYEE:
                return jsonify({"error": "Assigned user must be an employee"}), 400
            if not supervisor_has_employee(current_user, employee):
                return jsonify({"error": "Employee is not assigned to this supervisor"}), 403
            task.assigned_to_id = employee.id
        if 'done' in data:
            set_task_done_status(task, bool(data['done']))

    elif current_user.role == ROLE_ADMIN:
        if 'title' in data:
            task.title = data['title']
        if 'deadline' in data:
            deadline = parse_datetime(data['deadline'])
            if not deadline:
                return jsonify({"error": "Deadline must be a valid ISO date/time"}), 400
            task.deadline = deadline
        if 'done' in data:
            set_task_done_status(task, bool(data['done']))
    else:
        return jsonify({"error": "Invalid role"}), 403

    db.session.commit()
    return jsonify(serialize_task(task))


@app.route('/tasks/<int:id>', methods=['DELETE'])
@jwt_required()
def delete_task(id):
    current_user = get_current_user()
    if not current_user:
        return jsonify({"error": "User not found"}), 404

    task = db.get_or_404(Task, id)
    if current_user.role == ROLE_SUPERVISOR and task.created_by_id != current_user.id:
        return jsonify({"error": "You can only delete tasks you created"}), 403
    if current_user.role not in {ROLE_ADMIN, ROLE_SUPERVISOR}:
        return jsonify({"error": "Admin or supervisor access required"}), 403

    db.session.delete(task)
    db.session.commit()
    return jsonify({"message": "Task deleted"})


if __name__ == "__main__":
    app.run(debug=True)
