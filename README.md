ThreatGraph AI

Knowledge Graph + Machine Learning ile Siber Saldırı Analizi ve Tahmin Sistemi

ThreatGraph AI, siber güvenlik analizini Knowledge Graph (Neo4j) ve Machine Learning (Random Forest) ile birleştiren hibrit bir karar destek sistemidir.

Bu sistemin amacı, verilen bir artifact (örneğin: dns cache, access token) üzerinden olası saldırıları, saldırı akışını, savunma mekanizmalarını ve en olası saldırı tahminlerini üretmektir.

Proje Amacı

Geleneksel siber güvenlik sistemleri genellikle ikiye ayrılır:

Rule-based sistemler
Machine Learning tabanlı sistemler

Bu proje, bu iki yaklaşımı birleştirerek daha güçlü ve açıklanabilir bir yapı oluşturmayı hedefler.

Amaç:

Saldırıları sadece tespit etmek değil
Nasıl ilerlediğini anlamak
Ve gelecekteki saldırıları tahmin etmek
Sistem Mimarisi

Frontend (React)
→ FastAPI Backend
→ Mapping Service
→ Neo4j Graph Reasoning
→ Machine Learning (Random Forest)
→ Defense Recommendation

Temel Özellikler
Artifact Analizi
Kullanıcıdan alınan artifact normalize edilir ve en uygun canonical artifact ile eşleştirilir.
Graph Reasoning (Neo4j)
Direct attack ilişkileri bulunur
Tactic ilişkileri çıkarılır
Next tactic akışı hesaplanır
Defense önerileri belirlenir
Machine Learning
Graph tabanlı feature’lar kullanılır
Multi-label attack prediction yapılır
Top-5 saldırı tahmini üretilir
Confidence ve Abstention
Sistem düşük güven durumunda tahmin yapmaz
Gereksiz kesinlikten kaçınır
Örnek Senaryo

Girdi:

{
  "artifact": "dns cache",
  "description": "Observed DNS cache anomalies indicating possible exfiltration"
}

Çıktı:

Matched Artifact: DNS Lookup
Direct Attack: Data Exfiltration
Tactic: Collection
Next Tactic: Exfiltration
Defense: DNS Monitoring
ML Prediction: Top attack listesi
Backend Servisleri

analysis_service
Sistemin ana orchestrator katmanıdır. Tüm pipeline’ı yönetir.

mapping_service
Artifact eşleme işlemlerini gerçekleştirir. Rule-based ve similarity tabanlı çalışır.

reasoning_service
Neo4j graph üzerinden saldırı ilişkilerini ve akışları çıkarır.

ml_service
Random Forest modeli ile saldırı tahmini yapar.

defense_service
Graph verisine dayanarak savunma önerileri üretir.

Knowledge Graph Yapısı

Node tipleri:

Artifact
OffenseTech
DefenseTech
Tactic

Relationship tipleri:

OFF_REL
DEF_REL
HAS_TECHNIQUE
NEXT_TACTIC
Machine Learning Pipeline

Kullanılan feature’lar:

attack_count
defense_count
impact_count
centrality_score
category

Model:

Random Forest
Multi-label classification

Çıktı:

Top-5 attack prediction
Confidence score
Frontend

Frontend React + Vite ile geliştirilmiştir.

Özellikler:

Artifact giriş paneli
Analiz sonucu kartları
Canlı graph visualization
Senaryo bazlı test ekranı
Kullanılan Teknolojiler

Backend:

FastAPI
Python
Neo4j

Machine Learning:

scikit-learn
pandas
numpy

Frontend:

React
Vite
JavaScript
Kurulum

Backend:

cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload

Frontend:

cd frontend
npm install
npm run dev
API Endpointleri

GET /api/artifacts
Canonical artifact listesini döner.

POST /api/analyze
Artifact analizi yapar.

POST /api/graph/context
Graph visualization için veri döner.

Güçlü Yanlar
Knowledge Graph ve Machine Learning birlikte kullanılır
Açıklanabilir sonuçlar üretir
Saldırı akışını modelleyebilir
Savunma önerileri sunar
Confidence tabanlı karar verir
Sınırlamalar
Dataset sınırlı olabilir
Nadir saldırılar model tarafından öğrenilemeyebilir
Graph genişledikçe performans değişebilir
Gelecek Geliştirmeler
Daha büyük veri seti
Graph Neural Network entegrasyonu
SIEM sistemleri ile entegrasyon
Gerçek zamanlı threat intelligence
Geliştirici

Özge Kaçmaz
Computer Engineering Student

Sonuç

ThreatGraph AI, siber saldırı analizini sadece sonuç üretmekten çıkarıp, süreci açıklayan ve geleceği tahmin eden bir sistem haline getirir.