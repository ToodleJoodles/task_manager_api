from flask import Flask, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///app.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)


class Task(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(100), nullable=False)
    done = db.Column(db.Boolean, default=False)

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "done": self.done
        }


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
