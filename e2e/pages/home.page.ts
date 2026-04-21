import { Page, Locator, expect } from '@playwright/test';
import { BasePage, NavigationComponent, FooterComponent } from './base.page';

export class HomePage extends BasePage {
  readonly navigation: NavigationComponent;
  readonly footer: FooterComponent;
  
  readonly mainHeading: Locator;
  readonly tickerSection: Locator;
  readonly quickCategoriesSection: Locator;
  readonly recentProductsSection: Locator;
  readonly featuredProductsSection: Locator;
  readonly priceDropSection: Locator;
  readonly commercialDisclosure: Locator;

  constructor(page: Page) {
    super(page);
    this.navigation = new NavigationComponent(page);
    this.footer = new FooterComponent(page);
    
    this.mainHeading = page.getByRole('heading', { level: 1 });
    this.tickerSection = page.locator('section').filter({ hasText: /@/ }).first();
    this.quickCategoriesSection = page.getByText('CATEGORIAS RAPIDAS');
    this.recentProductsSection = page.getByText('VISTOS RECIENTEMENTE');
    this.featuredProductsSection = page.getByText('PRODUCTOS DESTACADOS');
    this.priceDropSection = page.getByText(/BAJARON DE PRECIO|RECIEN ACTUALIZADOS/);
    this.commercialDisclosure = page.getByText('TRANSPARENCIA COMERCIAL');
  }

  async goto(): Promise<void> {
    await this.page.goto('/');
    await this.waitForNetworkIdle();
  }

  async expectHeaderVisible(): Promise<void> {
    await expect(this.mainHeading).toBeVisible();
    await expect(this.mainHeading).toContainText('COMPARA PRECIOS');
  }

  async expectTickerVisible(): Promise<void> {
    await expect(this.tickerSection).toBeVisible();
    await expect(this.page.getByText('@ Mexx').first()).toBeVisible();
  }

  async expectQuickCategoriesVisible(): Promise<void> {
    await expect(this.quickCategoriesSection).toBeVisible();
    const categories = ['Procesadores', 'Tarjetas Graficas', 'Motherboards', 'Memoria RAM'];
    for (const category of categories) {
      await expect(this.page.locator('#main-content').getByRole('link', { name: category })).toBeVisible();
    }
  }

  async expectRecentProductsEmpty(): Promise<void> {
    await expect(this.recentProductsSection).toBeVisible();
    await expect(this.page.getByText('Todavia no hay productos vistos')).toBeVisible();
  }

  async expectCommercialDisclosure(): Promise<void> {
    await expect(this.commercialDisclosure).toBeVisible();
    await expect(this.page.getByText(/comparador independiente|no vendemos/i)).toBeVisible();
  }

  async navigateToCategory(categoryName: string): Promise<void> {
    await this.page.locator('#main-content').getByRole('link', { name: categoryName }).click();
    await this.page.waitForURL(new RegExp(`/search\\?category=${categoryName.toLowerCase().replace(/ /g, '-')}`));
  }

  async clickHowItWorks(): Promise<void> {
    await this.page.getByRole('link', { name: 'COMO FUNCIONA' }).click();
    await this.page.waitForURL(/\/acerca/);
  }
}