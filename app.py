# app.py
import os
from functools import wraps
from datetime import datetime

# eventlet monkey patch for socketio/gunicorn compatibility
import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template, redirect, url_for, request, flash, abort
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, logout_user, current_user, login_required
from werkzeug.security import generate_password_hash, check_password_hash
from flask_socketio import SocketIO, join_room, leave_room, emit
from flask_migrate import Migrate

# --- App init ---
app = Flask(__name__, static_folder="static", template_folder="templates")
app.secret_key = os.getenv("SECRET_KEY", "change_this_secret_change_it")
DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
app.config["SQLALCHEMY_DATABASE_URI"] = DATABASE_URL or "sqlite:///data.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db = SQLAlchemy(app)
migrate = Migrate(app, db)

# Use eventlet async mode explicitly
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="eventlet")

login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = "login"

# --- Models ---
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(200), unique=True, nullable=True)
    password_hash = db.Column(db.String(200), nullable=True)
    role = db.Column(db.String(20), default="user")  # admin / moderator / user / guest
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def set_password(self, pw):
        self.password_hash = generate_password_hash(pw)

    def check_password(self, pw):
        if not self.password_hash:
            return False
        return check_password_hash(self.password_hash, pw)

class Room(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), unique=True, nullable=False)
    slug = db.Column(db.String(120), unique=True, nullable=False)
    created_by = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)

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

# --- helpers ---
online_users = {}  # user_id -> {"username":..., "status":"online/away", "room": slug or None}

@login_manager.user_loader
def load_user(user_id):
    try:
        return User.query.get(int(user_id))
    except Exception:
        return None

# Create DB tables but DO NOT create default rooms here
@app.before_first_request
def create():
    db.create_all()

# If no admin exists, redirect most pages to setup-admin.
@app.before_request
def ensure_admin_exists():
    # Allow static files, setup admin page, login/register and socketio handshake to work
    allowed_paths = (
        "/setup-admin",
        "/login",
        "/register",
        "/static/",
        "/favicon.ico",
    )
    # allow socket.io websocket path
    if request.path.startswith("/socket.io"):
        return
    if any(request.path.startswith(p) for p in allowed_paths):
        return
    try:
        admin_exists = User.query.filter_by(role="admin").first() is not None
    except Exception:
        admin_exists = False
    if not admin_exists:
        # redirect everything else to setup-admin to create the first admin
        return redirect(url_for("setup_admin"))

# decorator for admin-only routes
def admin_required(f):
    @wraps(f)
    def wrapped(*args, **kwargs):
        if not current_user.is_authenticated or current_user.role != "admin":
            abort(403)
        return f(*args, **kwargs)
    return wrapped

# --- Routes ---
@app.route("/")
def index():
    rooms = Room.query.all()
    return render_template("index.html", rooms=rooms, current_user=current_user, online_count=len(online_users))

@app.route("/setup-admin", methods=["GET","POST"])
def setup_admin():
    # If admin already exists, go login
    if User.query.filter_by(role="admin").first():
        flash("Admin already exists", "info")
        return redirect(url_for("login"))
    if request.method == "POST":
        username = (request.form.get("username") or "admin").strip()
        email = request.form.get("email") or None
        password = request.form.get("password") or "adminpass"
        if not username:
            flash("Username required", "danger")
            return redirect(url_for("setup_admin"))
        if User.query.filter_by(username=username).first():
            flash("Username taken", "danger")
            return redirect(url_for("setup_admin"))
        u = User(username=username, email=email, role="admin")
        u.set_password(password)
        db.session.add(u)
        db.session.commit()
        flash("Admin created. Please log in.", "success")
        return redirect(url_for("login"))
    return render_template("setup_admin.html", current_user=current_user)

@app.route("/register", methods=["GET","POST"])
def register():
    if request.method == "POST":
        username = (request.form.get("username") or "").strip()
        if not username:
            flash("Username required","danger")
            return redirect(url_for("register"))
        if User.query.filter_by(username=username).first():
            flash("Username taken","danger")
            return redirect(url_for("register"))
        u = User(username=username, role="guest")
        db.session.add(u); db.session.commit()
        login_user(u)
        flash("Logged in as guest","success"); return redirect(url_for("index"))
    return render_template("register.html", current_user=current_user)

@app.route("/login", methods=["GET","POST"])
def login():
    if request.method=="POST":
        username = request.form.get("username")
        password = request.form.get("password")
        user = User.query.filter_by(username=username).first()
        if user and user.check_password(password):
            login_user(user)
            flash("Logged in","success"); return redirect(url_for("index"))
        flash("Bad credentials","danger"); return redirect(url_for("login"))
    return render_template("login.html", current_user=current_user)

@app.route("/logout")
@login_required
def logout():
    uid = current_user.get_id()
    online_users.pop(uid, None)
    logout_user(); flash("Logged out","info"); return redirect(url_for("index"))

@app.route("/rooms")
def rooms():
    rooms = Room.query.all()
    return render_template("rooms.html", rooms=rooms, current_user=current_user, online_count=len(online_users))

@app.route("/admin", methods=["GET","POST"])
@admin_required
def admin_panel():
    if request.method == "POST":
        name = (request.form.get("name") or "").strip()
        slug = (request.form.get("slug") or "").strip()
        if not name or not slug:
            flash("Name and slug are required", "danger")
        elif Room.query.filter_by(slug=slug).first():
            flash("Slug already used", "danger")
        else:
            db.session.add(Room(name=name, slug=slug, created_by=current_user.id))
            db.session.commit()
            flash("Room created","success")
    rooms = Room.query.all(); users = User.query.all()
    return render_template("admin.html", rooms=rooms, users=users, current_user=current_user)

@app.route("/make-moderator", methods=["POST"])
@login_required
def make_mod():
    if current_user.role != "admin": abort(403)
    try:
        uid = int(request.form.get("user_id"))
    except:
        uid = None
    slug = request.form.get("room_slug")
    if uid and slug:
        if not RoomModerator.query.filter_by(room_slug=slug, user_id=uid).first():
            db.session.add(RoomModerator(room_slug=slug, user_id=uid)); db.session.commit()
            flash("Moderator assigned","success")
    return redirect(url_for("admin_panel"))

@app.route("/room/<slug>")
@login_required
def room_view(slug):
    r = Room.query.filter_by(slug=slug).first_or_404()
    messages = Message.query.filter_by(room=slug).order_by(Message.ts.asc()).limit(500).all()
    members = [v for k,v in online_users.items() if v.get("room")==slug]
    return render_template("room.html", room=r, messages=messages, members=members, current_user=current_user)

@app.route("/private/<username>")
@login_required
def private_chat(username):
    other = User.query.filter_by(username=username).first_or_404()
    msgs = PrivateMessage.query.filter(
        ((PrivateMessage.sender==current_user.username) & (PrivateMessage.recipient==other.username)) | 
        ((PrivateMessage.sender==other.username) & (PrivateMessage.recipient==current_user.username))
    ).order_by(PrivateMessage.ts.asc()).all()
    return render_template("private.html", other=other, messages=msgs, current_user=current_user)

# --- Socket.IO events ---
@socketio.on("connect")
def on_connect():
    # Allow anonymous visitors too; if user authenticated, add to online list
    try:
        if current_user.is_authenticated:
            uid = current_user.get_id()
            online_users[uid] = {"username": current_user.username, "status":"online", "room": None}
    except Exception:
        pass
    emit("presence_update", {"online_count": len(online_users)}, broadcast=True)

@socketio.on("set_status")
def on_status(data):
    status = data.get("status") or "online"
    uid = current_user.get_id() if current_user.is_authenticated else None
    if uid and uid in online_users:
        online_users[uid]["status"] = status
        emit("presence_update", {"online_count": len(online_users)}, broadcast=True)

@socketio.on("join")
def on_join(data):
    room = data.get("room")
    username = current_user.username if current_user.is_authenticated else data.get("username","زائر")
    if not room:
        return
    join_room(room)
    uid = current_user.get_id() if current_user.is_authenticated else None
    if uid and uid in online_users:
        online_users[uid]["room"] = room
    emit("system_message", {"msg": f"{username} انضم للغرفة."}, room=room)
    emit("members_update", {"members":[v for k,v in online_users.items() if v.get("room")==room]}, room=room)

@socketio.on("leave")
def on_leave(data):
    room = data.get("room")
    username = current_user.username if current_user.is_authenticated else data.get("username","زائر")
    if not room:
        return
    leave_room(room)
    uid = current_user.get_id() if current_user.is_authenticated else None
    if uid and uid in online_users:
        online_users[uid]["room"] = None
    emit("system_message", {"msg": f"{username} غادر الغرفة."}, room=room)
    emit("members_update", {"members":[v for k,v in online_users.items() if v.get("room")==room]}, room=room)

@socketio.on("message")
def on_message(data):
    room = data.get("room"); text = data.get("text")
    username = current_user.username if current_user.is_authenticated else "زائر"
    if room and text:
        m = Message(room=room, user=username, text=text); db.session.add(m); db.session.commit()
        emit("message", {"user": username, "text": text, "ts": m.ts.isoformat()}, room=room)

@socketio.on("private_message")
def on_private(data):
    to = data.get("to"); text = data.get("text"); frm = current_user.username if current_user.is_authenticated else "زائر"
    if to and text:
        pm = PrivateMessage(sender=frm, recipient=to, text=text); db.session.add(pm); db.session.commit()
        emit("private_message", {"from": frm, "to": to, "text": text}, broadcast=True)

@socketio.on("kick")
def on_kick(data):
    target = data.get("target"); room = data.get("room")
    allowed = False
    if current_user.is_authenticated and current_user.role == "admin":
        allowed = True
    else:
        if current_user.is_authenticated and RoomModerator.query.filter_by(room_slug=room, user_id=current_user.id).first():
            allowed = True
    if not allowed:
        emit("system_message", {"msg":"ليس لديك صلاحية للطرد."}, room=current_user.get_id() if current_user.is_authenticated else None)
        return
    emit("kicked", {"target": target, "room": room}, room=room)

# --- Run (for local dev) ---
if __name__ == "__main__":
    # Local dev server (not used on Railway; Railway will use Procfile/gunicorn)
    db.create_all()
    socketio.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 5000)))
