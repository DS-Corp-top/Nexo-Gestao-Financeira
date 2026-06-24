from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
print(default_storage.save('test.txt', ContentFile(b'hello world')))
