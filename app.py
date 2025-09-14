import os
from flask import Flask, render_template, redirect, url_for, request, flash, jsonify, abort
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, logout_user, current_user, login_required
from werkzeug.security import generate_password_hash, check_password_hash
from flask_socketio import SocketIO, join_room, leave_room, emit
from datetime import datetime

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "super_secret_key")

# إعداد قاعدة البيانات
DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

app.config["SQLALCHEMY_DATABASE_URI"] = DATABASE_URL or "sqlite:///data.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db = SQLAlchemy(app)
socketio = SocketIO(app, cors_allowed_origins="*")

login_manager = LoginManager(app)
login_manager.login_view = "login"

# =======================
# Models
# =======================
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(200), unique=True, nullable=True)
    password_hash = db.Column(db.String(200), nullable=True)
    role = db.Column(db.String(20), default="guest")  # admin / moderator / user / guest
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def set_password(self, pw):
        self.password_hash = generate_password_hash(pw)

    def check_password(self, pw):
        return self.password_hash and check_password_hash(self.password_hash, pw)

class Room(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), unique=True, nullable=False)
    slug = db.Column(db.String(120), unique=True, nullable=False)
    created_by = db.Column(db.Integer, db.ForeignKey("user.id"))

class Message(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    room = db.Column(db.String(120), nullable=False)
    user = db.Column(db.String(120), nullable=False)
    text = db.Column(db.Text, nullable=False)
    ts = db.Column(db.DateTime, default=datetime.utcnow)

class PrivateMessage(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    sender = db.Column(db.String(120), nullable=False)
    recipient = db.Column(db.String(120), nullable=False)
    text = db.Column(db.Text, nullable=False)
    ts = db.Column(db.DateTime, default=datetime.utcnow)

class RoomModerator(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    room_slug = db.Column(db.String(120), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)

# =======================
# Helpers
# =======================
online_users = {}  # {user_id: {"username":..., "status":..., "room":...}}

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

@app.before_request
def init_db():
    if not hasattr(app, "db_initialized"):
        db.create_all()
        app.db_initialized = True

# =======================
# Routes
# =======================
@app.route("/")
def index():
    rooms = Room.query.all()
    return render_template("index.html", rooms=rooms, online_count=len(online_users), current_user=current_user)

@app.route("/setup-admin", methods=["GET","POST"])
def setup_admin():
    if User.query.filter_by(role="admin").first():
        flash("مدير موجود مسبقاً", "info")
        return redirect(url_for("login"))
    if request.method == "POST":
        username = request.form.get("username")
        password = request.form.get("password")
        email = request.form.get("email")
        if not username or not password:
            flash("اسم المستخدم وكلمة المرور مطلوبين", "danger")
            return redirect(url_for("setup_admin"))
        admin = User(username=username, email=email, role="admin")
        admin.set_password(password)
        db.session.add(admin)
        db.session.commit()
        flash("تم إنشاء المدير", "success")
        return redirect(url_for("login"))
    return render_template("setup_admin.html")

@app.route("/register", methods=["GET","POST"])
def register():
    if request.method == "POST":
        username = request.form.get("username").strip()
        if not username:
            flash("اسم المستخدم مطلوب", "danger")
            return redirect(url_for("register"))
        if User.query.filter_by(username=username).first():
            flash("اسم المستخدم مأخوذ", "danger")
            return redirect(url_for("register"))
        u = User(username=username, role="guest")
        db.session.add(u)
        db.session.commit()
        login_user(u)
        flash("تم تسجيل الدخول كزائر", "success")
        return redirect(url_for("index"))
    return render_template("register.html")

@app.route("/login", methods=["GET","POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username")
        password = request.form.get("password")
        user = User.query.filter_by(username=username).first()
        if user and user.check_password(password):
            login_user(user)
            flash("تم تسجيل الدخول", "success")
            return redirect(url_for("index"))
        flash("بيانات الدخول غير صحيحة", "danger")
        return redirect(url_for("login"))
    return render_template("login.html")

@app.route("/logout")
@login_required
def logout():
    uid = current_user.get_id()
    online_users.pop(uid, None)
    logout_user()
    flash("تم تسجيل الخروج", "info")
    return redirect(url_for("index"))

@app.route("/admin", methods=["GET","POST"])
@login_required
def admin_panel():
    if current_user.role != "admin":
        abort(403)
    if request.method == "POST":
        name = request.form.get("name")
        slug = request.form.get("slug")
        if name and slug and not Room.query.filter_by(slug=slug).first():
            r = Room(name=name, slug=slug, created_by=current_user.id)
            db.session.add(r)
            db.session.commit()
            flash("تم إنشاء الغرفة", "success")
        else:
            flash("Slug موجود مسبقاً أو خطأ", "danger")
    rooms = Room.query.all()
    users = User.query.all()
    return render_template("admin.html", rooms=rooms, users=users)

@app.route("/room/<slug>")
@login_required
def room_view(slug):
    r = Room.query.filter_by(slug=slug).first_or_404()
    messages = Message.query.filter_by(room=slug).order_by(Message.ts.asc()).limit(500).all()
    members = [v for v in online_users.values() if v.get("room") == slug]
    return render_template("room.html", room=r, messages=messages, members=members)

@app.route("/private/<username>")
@login_required
def private_chat(username):
    other = User.query.filter_by(username=username).first_or_404()
    msgs = PrivateMessage.query.filter(
        ((PrivateMessage.sender == current_user.username) & (PrivateMessage.recipient == other.username)) |
        ((PrivateMessage.sender == other.username) & (PrivateMessage.recipient == current_user.username))
    ).order_by(PrivateMessage.ts.asc()).all()
    return render_template("private.html", other=other, messages=msgs)

# =======================
# Socket.IO Events
# =======================
@socketio.on("connect")
def on_connect():
    if current_user.is_authenticated:
        online_users[current_user.get_id()] = {"username": current_user.username, "status": "online", "room": None}
        emit("presence_update", {"online_count": len(online_users)}, broadcast=True)

@socketio.on("set_status")
def on_status(data):
    uid = current_user.get_id()
    if uid in online_users:
        online_users[uid]["status"] = data.get("status", "online")
        emit("presence_update", {"online_count": len(online_users)}, broadcast=True)

@socketio.on("join")
def on_join(data):
    room = data.get("room")
    username = current_user.username
    join_room(room)
    if current_user.get_id() in online_users:
        online_users[current_user.get_id()]["room"] = room
    emit("system_message", {"msg": f"{username} انضم للغرفة"}, room=room)

@socketio.on("leave")
def on_leave(data):
    room = data.get("room")
    username = current_user.username
    leave_room(room)
    if current_user.get_id() in online_users:
        online_users[current_user.get_id()]["room"] = None
    emit("system_message", {"msg": f"{username} غادر الغرفة"}, room=room)

@socketio.on("message")
def on_message(data):
    room = data.get("room")
    text = data.get("text")
    if room and text:
        m = Message(room=room, user=current_user.username, text=text)
        db.session.add(m)
        db.session.commit()
        emit("message", {"user": current_user.username, "text": text, "ts": m.ts.isoformat()}, room=room)

@socketio.on("private_message")
def on_private(data):
    to = data.get("to")
    text = data.get("text")
    if to and text:
        pm = PrivateMessage(sender=current_user.username, recipient=to, text=text)
        db.session.add(pm)
        db.session.commit()
        emit("private_message", {"from": current_user.username, "to": to, "text": text}, broadcast=True)

@socketio.on("kick")
def on_kick(data):
    room = data.get("room")
    target = data.get("target")
    allowed = current_user.role == "admin" or RoomModerator.query.filter_by(room_slug=room, user_id=current_user.id).first()
    if not allowed:
        emit("system_message", {"msg": "لا تملك صلاحية الطرد"}, room=current_user.id)
        return
    emit("kicked", {"target": target, "room": room}, room=room)

# =======================
if __name__ == "__main__":
    db.create_all()
    socketio.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 5000)))
