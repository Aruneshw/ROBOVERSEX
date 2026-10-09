from flask import Flask, request, jsonify
import sys
import json
import logging
from rvx_sim.runner import judge, JUDGE_VERSION

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)

@app.route("/", methods=["GET"])
def health():
    return jsonify({"status": "ok", "version": JUDGE_VERSION})

@app.route("/judge", methods=["POST"])
def run_judge():
    try:
        job = request.get_json()
        if not job:
            return jsonify({"error": "Invalid JSON"}), 400
            
        # The judge() function handles sandbox audit hooks and scoring
        result = judge(job)
        return jsonify(result)
    except Exception as e:
        logging.error(f"Judge error: {e}", exc_info=True)
        return jsonify({
            "judge_version": JUDGE_VERSION,
            "status": "error",
            "error": f"Judge Server Error: {str(e)}",
            "score": 0.0
        }), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)
