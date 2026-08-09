import os
import sys

# Thêm thư mục cha của thư mục api/ (tức là thư mục root backend/) vào sys.path để Python tìm thấy package 'app'
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.main import app
