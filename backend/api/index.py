import os
import sys
import traceback

try:
    # Thêm thư mục cha của api/ vào sys.path
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    
    from app.main import app
except Exception as e:
    from fastapi import FastAPI
    from fastapi.responses import HTMLResponse
    
    app = FastAPI(title="Error Diagnostic Portal")
    error_msg = traceback.format_exc()
    
    @app.get("/api")
    async def get_error():
        html_content = f"""
        <html>
            <head><title>Backend Startup Error Details</title></head>
            <body style="font-family: monospace; padding: 20px; background-color: #1e1e1e; color: #f4f4f4; line-height: 1.5;">
                <h1 style="color: #ff6b6b;">Backend Startup Error Details</h1>
                <p>An exception occurred during the backend initialization phase on Vercel:</p>
                <pre style="background: #2d2d2d; padding: 15px; border-radius: 5px; overflow-x: auto; border: 1px solid #ff6b6b; font-size: 14px;">{error_msg}</pre>
            </body>
        </html>
        """
        return HTMLResponse(content=html_content, status_code=200)
