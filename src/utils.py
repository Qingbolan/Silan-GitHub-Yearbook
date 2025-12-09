import yaml
import os
from datetime import datetime

def load_config(config_path="config/settings.yaml"):
    with open(config_path, 'r') as f:
        config = yaml.safe_load(f)
    return config

def parse_date(date_str):
    return datetime.strptime(date_str, "%Y-%m-%d")
