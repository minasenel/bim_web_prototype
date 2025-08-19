import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CommonModule, HttpClientModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('frontend');

  results: any[] = [];
  coords: GeolocationCoordinates | null = null;
  nearest: Record<number, any> = {};

  constructor(private http: HttpClient) {}

  search(q: string) {
    if (!q) return;
    this.http
      .get<{ items: any[] }>(`/api/searchProduct`, { params: { q } })
      .subscribe((res) => {
        this.results = res.items || [];
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
}
