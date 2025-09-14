import os
from flask import Flask, render_template, redirect, url_for, request, session, flash
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from flask_socketio import SocketIO, join_room, leave_room, send
from werkzeug.security import generate_password_hash, check_password_hash

# إعداد التطبيق
app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "secret123")

# قاعدة البيانات (Railway PostgreSQL)
db_url = os.environ.get("DATABASE_URL", "sqlite:///local.db")
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)
app.config["SQLALCHEMY_DATABASE_URI"] = db_url
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db = SQLAlchemy(app)
socketio = SocketIO(app)
login_manager = LoginManager(app)
login_manager.login_view = "login"

# موديل المستخدم
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True)
    password_hash = db.Column(db.String(200))
    is_admin = db.Column(db.Boolean, default=False)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

# موديل الغرفة
class Room(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), unique=True, nullable=False)

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# الصفحة الرئيسية
@app.route("/")
def index():
    rooms = Room.query.all()
    return render_template("index.html", rooms=rooms, current_user=current_user)

# إنشاء مدير أول مرة
@app.route("/setup-admin", methods=["GET", "POST"])
def setup_admin():
    if User.query.filter_by(is_admin=True).first():
        return redirect(url_for("login"))
    if request.method == "POST":
        email = request.form["email"]
        password = request.form["password"]
        user = User(username="admin", email=email, is_admin=True)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
        flash("تم إنشاء المدير")
        return redirect(url_for("login"))
    return render_template("setup_admin.html")

# تسجيل دخول
@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        email = request.form["email"]
        password = request.form["password"]
        user = User.query.filter_by(email=email).first()
        if user and user.check_password(password):
            login_user(user)
            return redirect(url_for("index"))
        flash("خطأ بالبريد أو كلمة المرور")
    return render_template("login.html")

# تسجيل زائر
@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        username = request.form["username"]
        if User.query.filter_by(username=username).first():
            flash("الاسم مستخدم")
            return redirect(url_for("register"))
        user = User(username=username)
        db.session.add(user)
        db.session.commit()
        login_user(user)
        return redirect(url_for("index"))
    return render_template("register.html")

# تسجيل خروج
@app.route("/logout")
@login_required
def logout():
    logout_user()
    return redirect(url_for("index"))

# إنشاء غرفة (للأدمن فقط)
@app.route("/create-room", methods=["POST"])
@login_required
def create_room():
    if not current_user.is_admin:
        return redirect(url_for("index"))
    name = request.form["room_name"]
    if not Room.query.filter_by(name=name).first():
        room = Room(name=name)
        db.session.add(room)
        db.session.commit()
    return redirect(url_for("index"))

# غرفة الدردشة
@app.route("/room/<room_name>")
@login_required
def room(room_name):
    room = Room.query.filter_by(name=room_name).first_or_404()
    return render_template("room.html", room=room, current_user=current_user)

# SocketIO
@socketio.on("join")
def handle_join(data):
    room = data["room"]
    join_room(room)
    send(f"{current_user.username} انضم", to=room)

@socketio.on("leave")
def handle_leave(data):
    room = data["room"]
    leave_room(room)
    send(f"{current_user.username} غادر", to=room)

@socketio.on("message")
def handle_message(data):
    room = data["room"]
    msg = f"{current_user.username}: {data['msg']}"
    send(msg, to=room)

if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    socketio.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
