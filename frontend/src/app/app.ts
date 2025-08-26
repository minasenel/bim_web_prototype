import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ChatService } from './services/chat.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CommonModule, HttpClientModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('frontend');

  results: any[] = [];
  coords: GeolocationCoordinates | null = null;
  nearest: Record<number, any> = {};
  
  // Kategori özellikleri
  categories: string[] = [];
  selectedCategory: string | null = null;
  categoryResults: any[] = [];
  
  // Kategori fotoğrafları için yeni özellikler
  categoriesWithImages: any[] = [];
  
  // Brand logoları
  brandLogos: Record<string, string> = {};
  
  // Chatbot properties
  isChatOpen = false;
  chatMessages: any[] = [];
  userMessage = '';
  private readonly sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

  constructor(private http: HttpClient, private chatService: ChatService) {
    this.loadCategories();
    this.loadCategoriesWithImages(); // Yeni metod çağrısı
    this.loadBrandLogos();
  }

  // Kategorileri yükle
  loadCategories() {
    this.http
      .get<{ categories: string[] }>('/api/categories')
      .subscribe((res) => {
        this.categories = res.categories || [];
      });
  }
  
  // Kategorileri fotoğraflarıyla birlikte yükle
  loadCategoriesWithImages() {
    this.http
      .get<{ categories: any[] }>('/api/categories-with-images')
      .subscribe((res) => {
        this.categoriesWithImages = res.categories || [];
        console.log('Kategoriler fotoğraflarıyla yüklendi:', this.categoriesWithImages);
        
        // Her kategori için detaylı log
        this.categoriesWithImages.forEach(category => {
          console.log(`Kategori: ${category.category_name}`);
          console.log(`  - image_path: ${category.image_path}`);
          console.log(`  - image_url: ${category.image_url}`);
          console.log(`  - has_image: ${category.has_image}`);
        });
      });
  }
  
  // Resim yükleme hatası için
  onImageError(event: any) {
    console.log('Resim yüklenemedi:', event.target.src);
    // Hata durumunda varsayılan ikonu göster
    event.target.style.display = 'none';
    const parent = event.target.parentElement;
    if (parent) {
      const fallbackIcon = parent.querySelector('.category-icon');
      if (fallbackIcon) {
        fallbackIcon.style.display = 'block';
      }
    }
  }
  
  // Brand logolarını yükle
  loadBrandLogos() {
    this.http
      .get<{ brandLogos: Record<string, string> }>('/api/brandLogos')
      .subscribe((res) => {
        this.brandLogos = res.brandLogos || {};
        console.log('Brand logoları yüklendi:', this.brandLogos);
      });
  }
  
  // Brand logosunu getir
  getBrandLogo(brandName: string): string | null {
    return this.brandLogos[brandName] || null;
  }
  
  search(q: string) {
    if (!q) return;
    this.http
      .get<{ items: any[] }>(`/api/searchProduct`, { params: { q } })
      .subscribe((res) => {
        const items = res.items || [];
        // Arama sonuçlarını kategori kart görünümünde göstermek için bağla
        this.selectedCategory = q;
        this.categoryResults = items.map(item => ({
          ...item,
          brandLogo: this.getBrandLogo(item.brand)
        }));
        // Liste görünümünü kapatmak için temizle
        this.results = [];
      });
  }

  locate() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      this.coords = pos.coords;
    });
  }

  findNearest(productId: number) {
    const lat = this.coords?.latitude ?? 41.0082; // default Istanbul
    const lng = this.coords?.longitude ?? 28.9784;
    this.http
      .get<{ items: any[] }>(`/api/nearestStore`, { params: { lat, lng, productId } as any })
      .subscribe((res) => {
        this.nearest[productId] = res.items?.[0];
      });
  }
  
  // Kategori arama fonksiyonu
  searchByCategory(category: string) {
    this.selectedCategory = category;
    this.http
      .get<{ items: any[]; count: number; category: string }>(`/api/productsByCategory`, { params: { category } })
      .subscribe((res) => {
        this.categoryResults = res.items || [];
        // Her ürün için brand logosunu ekle
        this.categoryResults.forEach(item => {
          item.brandLogo = this.getBrandLogo(item.brand);
        });
        this.results = []; // Ana arama sonuçlarını temizle
        console.log(`${category} kategorisinde ${res.count} ürün bulundu:`, res.items);
      });
  }
  
  // Ana aramaya geri dön
  clearCategory() {
    this.selectedCategory = null;
    this.categoryResults = [];
    this.results = [];
  }

  // Chatbot methods
  toggleChat() {
    this.isChatOpen = !this.isChatOpen;
    if (this.isChatOpen) {
      this.addBotMessage('Merhaba! Ben tarif asistanınızım. Hangi tarifi yapmak istiyorsunuz? 👨‍🍳');
    }
  }
  
  addBotMessage(text: string) {
    this.chatMessages.push({
      type: 'bot',
      text,
      time: new Date()
    });
    this.scrollToBottom();
  }
  
  addUserMessage(text: string) {
    this.chatMessages.push({
      type: 'user',
      text,
      time: new Date()
    });
  }
  
  async sendMessage() {
    if (!this.userMessage.trim()) return;
    
    const message = this.userMessage.trim();
    this.addUserMessage(message);
    this.userMessage = '';
    
    try {
      const response = await this.chatService.sendMessage(message, this.sessionId).toPromise();
      console.log('✅ Response:', response);

      let botResponse = '';
      if (typeof response === 'string') {
        botResponse = response;
      } else if (response?.output) {
        botResponse = response.output;
      } else if (response?.message) {
        botResponse = response.message;
      } else if (response?.content?.parts?.[0]?.text) {
        botResponse = response.content.parts[0].text;
      } else {
        botResponse = 'Tarif hazırlandı! Başka bir tarif ister misiniz?';
      }

      this.addBotMessage(botResponse);
    } catch (error) {
      console.error('❌ Chatbot error:', error);
      this.addBotMessage('Bağlantı hatası oluştu. Lütfen tekrar deneyin.');
    }
  }
  
  scrollToBottom() {
    setTimeout(() => {
      const container = document.querySelector('.chat-messages');
      if (container) {
        (container as HTMLElement).scrollTop = (container as HTMLElement).scrollHeight;
      }
    }, 100);
  }
}
