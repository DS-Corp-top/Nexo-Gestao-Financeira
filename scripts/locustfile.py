from locust import HttpUser, task, between

class NexoUser(HttpUser):
    # Simula um tempo de espera (pensamento do usuário) entre 1 e 3 segundos antes de cada clique
    wait_time = between(1, 3)

    @task
    def access_login(self):
        # Acessa a rota de login
        self.client.get("/")
        
    @task(3) # O peso "3" faz essa task rodar 3x mais do que as outras
    def check_health(self):
        # Supondo que você tenha uma rota de healthcheck ou api no backend
        self.client.options("/api/v1/auth/token/")
