export const predefinedScenarios = [
  {
    id: "phishing-credential-chain",
    title: "Phishing Sonrası Kimlik Bilgisi Ele Geçirilmesi",
    scenarioText:
      "Bir kullanıcının phishing e-postasındaki bağlantıya tıklaması sonrası kimlik bilgileri ele geçiriliyor. Saldırgan daha sonra kurumsal hesaba giriş yapmaya ve oturum erişimini kalıcı hale getirmeye çalışıyor.",
    previewComment:
      "Kimlik bilgisi hırsızlığı, hesap devralma ve oturum kötüye kullanımı zincirini yorumlamak için hazır senaryo.",
  },
  {
    id: "session-cookie-misuse",
    title: "Çalınan Oturum Çerezi ile Hesap Devralma",
    scenarioText:
      "Bir web uygulamasında kullanıcının oturum çerezi istemci tarafında ele geçiriliyor. Saldırgan çerezi tekrar kullanarak yetkili oturuma erişiyor ve normal kullanıcı davranışı gibi görünmeye çalışıyor.",
    previewComment:
      "Oturum devralma, token veya çerez kötüye kullanımı ve yetki bağlamı incelemesi için kısa senaryo.",
  },
  {
    id: "malicious-file-execution",
    title: "Zararlı Dosya Çalıştırılması ve Sonraki Adımlar",
    scenarioText:
      "Kullanıcı şüpheli bir dosya çalıştırdıktan sonra sistemde komut yürütme izleri, script davranışı ve yeni süreçler gözlemleniyor. Olayın hangi saldırı aşamalarına işaret ettiği anlaşılmak isteniyor.",
    previewComment:
      "Execution ve olası post-exploitation adımlarını görmek için hazır analiz girdisi.",
  },
  {
    id: "suspicious-dns-traffic",
    title: "Şüpheli DNS Trafiği ve Ağ Keşfi Şüphesi",
    scenarioText:
      "Bir istemcide olağandışı DNS sorguları, tekrarlayan çözümleme denemeleri ve dış hedeflerle ilişkili trafik örüntüleri fark ediliyor. Bunun keşif veya yönlendirme amaçlı olup olmadığı değerlendirilmek isteniyor.",
    previewComment:
      "DNS davranışı üzerinden keşif, yönlendirme ve ağ odaklı taktikleri yorumlamak için kullanılır.",
  },
];

export function getPredefinedScenarioById(scenarioId) {
  return predefinedScenarios.find((scenario) => scenario.id === scenarioId) || null;
}
