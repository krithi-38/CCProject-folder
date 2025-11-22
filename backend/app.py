import os
import uuid
from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
from fpdf import FPDF
from pymongo import MongoClient
from dotenv import load_dotenv
from openai import OpenAI

# ----------------- LOAD ENV VARIABLES -----------------
load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
DB_NAME = os.getenv("DB_NAME", "CertificatesDB")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# ----------------- DATABASE SETUP -----------------
client = MongoClient(MONGO_URI)
db = client[DB_NAME]
collection = db["certificates"]

# ----------------- OPENAI / GEMINI SETUP -----------------
client1 = OpenAI(
    api_key=OPENAI_API_KEY,
    base_url="https://generativelanguage.googleapis.com/v1beta/openai/"
)

# ----------------- FLASK SETUP -----------------
app = Flask(__name__)
CORS(app)

# Folders
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['TEMPLATE_FOLDER'] = 'certificate_templates'
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# ----------------- SERVE STATIC FILES -----------------
@app.route('/')
def serve_index():
    return send_file('newindex.html')

@app.route('/newverify.html')
def serve_verify():
    return send_file('newverify.html')

@app.route('/newstyle.css')
def serve_css():
    return send_file('newstyle.css')

@app.route('/newscript.js')
def serve_js():
    return send_file('newscript.js')

# ----------------- CERTIFICATE GENERATION -----------------
def generate_certificate(data):
    cert_type = data.get('certType')
    name = data.get('name', '[Student Name]')
    course = data.get('course', '[Course/Event]')
    date = data.get('date', '[Date]')
    custom_title = data.get('customTitle')
    position_type = data.get('positionType')
    position_value = data.get('positionValue')
    logo_file = data.get('logo')
    signature_file = data.get('signature')

    # Map certificate type to template
    template_map = {
        "Course Completion": "course_completion.png",
        "Participation": "participation.png",
        "Achievement": "achievement.png",
        "Custom": "custom.png"
    }
    template_img = os.path.join(app.config['TEMPLATE_FOLDER'], template_map.get(cert_type, 'custom.png'))
    if not os.path.exists(template_img):
        raise FileNotFoundError(f"Template {template_img} not found!")

    pdf = FPDF('P', 'mm', 'A4')
    pdf.add_page()
    pdf.image(template_img, x=0, y=0, w=210, h=297)

    if logo_file and os.path.exists(logo_file):
        pdf.image(logo_file, x=10, y=10, w=30)

    if signature_file and os.path.exists(signature_file):
        pdf.image(signature_file, x=150, y=250, w=40)

    cert_id = f"CERT-{uuid.uuid4().hex[:8].upper()}"

    # Dynamic text
    pdf.set_font("Helvetica", "B", 24)
    pdf.set_xy(0, 120)
    pdf.cell(210, 10, name, align="C")

    pdf.set_font("Helvetica", "", 18)
    pdf.set_xy(0, 150)
    pdf.cell(210, 10, course, align="C")

    pdf.set_xy(0, 170)
    pdf.cell(210, 10, f"Date: {date}", align="C")

    if cert_type == "Custom" and custom_title:
        pdf.set_xy(0, 100)
        pdf.set_font("Helvetica", "B", 20)
        pdf.cell(210, 10, custom_title, align="C")

    if cert_type == "Achievement" and position_type and position_value:
        pdf.set_xy(0, 180)
        pdf.set_font("Helvetica", "B", 16)
        pdf.cell(210, 10, f"{position_type}: {position_value}", align="C")

    pdf.set_xy(0, 280)
    pdf.set_font("Helvetica", "", 12)
    pdf.cell(210, 10, f"Certificate ID: {cert_id}", align="C")

    output_file = os.path.join(app.config['UPLOAD_FOLDER'], f"{cert_id}.pdf")
    pdf.output(output_file)

    return output_file

# ----------------- GENERATE CERTIFICATE API -----------------
@app.route('/generate-certificate', methods=['POST'])
def generate_certificate_api():
    try:
        data = request.form.to_dict()
        logo_file = request.files.get('logo')
        signature_file = request.files.get('signature')

        if logo_file:
            logo_path = os.path.join(app.config['UPLOAD_FOLDER'], f"{uuid.uuid4().hex}_{logo_file.filename}")
            logo_file.save(logo_path)
            data['logo'] = logo_path

        if signature_file:
            sig_path = os.path.join(app.config['UPLOAD_FOLDER'], f"{uuid.uuid4().hex}_{signature_file.filename}")
            signature_file.save(sig_path)
            data['signature'] = sig_path

        pdf_file = generate_certificate(data)

        # Save record to DB
        cert_record = {
            "id": os.path.basename(pdf_file).split(".")[0],
            "name": data.get("name", ""),
            "course": data.get("course", ""),
            "date": data.get("date", ""),
            "certType": data.get("certType", ""),
            "positionType": data.get("positionType", ""),
            "positionValue": data.get("positionValue", ""),
            "customTitle": data.get("customTitle", ""),
            "pdf_path": pdf_file
        }
        collection.insert_one(cert_record)

        return send_file(pdf_file, as_attachment=True)

    except Exception as e:
        return f"Error: {str(e)}", 500

# ----------------- VERIFY CERTIFICATE API -----------------
@app.route('/verify-certificate', methods=['POST'])
def verify_certificate():
    try:
        data = request.get_json()
        cert_id = data.get('certId')
        if not cert_id:
            return jsonify({"status": "error", "message": "Certificate ID missing"}), 400

        cert = collection.find_one({"id": cert_id})
        if cert:
            return jsonify({
                "status": "valid",
                "certificate": {
                    "name": cert["name"],
                    "course": cert["course"],
                    "date": cert["date"],
                    "certType": cert["certType"]
                }
            })
        else:
            return jsonify({"status": "invalid"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# ----------------- CHATBOT -----------------
RULE_BASED_PROMPT = """
You are a Certificate Assistant. Follow these rules strictly:
1. If user greets (hello, hi, hey, hola), respond with a friendly greeting.
2. If user asks for help, explain what tasks you can perform (generate, verify, types, troubleshoot).
3. If user wants to generate a certificate, guide them step by step in points.
4. If user asks about certificate types, list Completion, Participation, Achievement, Custom.
5. If user asks to verify, explain the verification process step by step.
6. If user asks about template/design, describe the design for each type.
7. If user mentions problem/error, provide common solutions.
8. If user says thanks, respond politely.
9. If user says bye/goodbye/exit, respond with a goodbye.
10. If none of the above, give a default message prompting what user can ask about certificates.
Always keep responses concise, friendly, and use emojis when appropriate.
"""

@app.route("/chatbot", methods=["GET", "POST"])
def chatbot():
    try:
        data = request.get_json()
        user_message = data.get("message", "").strip()
        if not user_message:
            return jsonify({"error": "No message provided"}), 400

        response = client1.chat.completions.create(
            model="models/gemini-2.5-pro",
            messages=[
                {"role": "system", "content": RULE_BASED_PROMPT},
                {"role": "user", "content": user_message}
            ],
            temperature=0.7
        )
        gemini_reply = response.choices[0].message.content
        return jsonify({"response": gemini_reply})

    except Exception as e:
        print("Error:", e)
        return jsonify({"response": "🤖 Sorry, something went wrong. Please try again."})

# ----------------- MAIN -----------------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 5001)))
