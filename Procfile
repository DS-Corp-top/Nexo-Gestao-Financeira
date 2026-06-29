release: python manage.py check_react_build && python manage.py migrate --noinput
web: gunicorn --pythonpath backend core.wsgi --workers 3 --threads 2 --worker-class gthread --log-file -
worker: celery --workdir backend -A core worker --loglevel=info --concurrency=2
