import { Page, Locator, expect } from '@playwright/test';
import { BasePage, FooterComponent } from './base.page';

export class SearchPage extends BasePage {
  readonly footer: FooterComponent;
  
  readonly searchInput: Locator;
  readonly clearButton: Locator;
  readonly searchButton: Locator;
  readonly filterSection: Locator;
  readonly categoryButtons: Locator;
  readonly resultsSection: Locator;
  readonly paginationSection: Locator;
  readonly noResultsMessage: Locator;
  readonly searchingMessage: Locator;

  constructor(page: Page) {
    super(page);
    this.footer = new FooterComponent(page);
    
    this.searchInput = page.getByPlaceholder(/BUSCAR|NUEVA/i);
    this.clearButton = page.getByRole('button', { name: /LIMPIAR BUSQUEDA/i });
    this.searchButton = page.getByRole('button', { name: /SEARCH/i });
    this.filterSection = page.getByText('FILTROS');
    this.categoryButtons = page.getByRole('button', { name: /filtrar por categoría/i });
    this.resultsSection = page.locator('#product-grid-start');
    this.paginationSection = page.getByText(/NIVEL \d+ \/ \d+/);
    this.noResultsMessage = page.getByText('[ SIN RESULTADOS ]');
    this.searchingMessage = page.getByText(/ESCANEANDO|BUSCANDO|Consultando/i);
  }

  async goto(query?: string): Promise<void> {
    const url = query ? `/search?q=${encodeURIComponent(query)}` : '/search';
    await this.page.goto(url);
    await this.waitForNetworkIdle();
  }

  async gotoCategory(category: string): Promise<void> {
    await this.page.goto(`/search?category=${category}`);
    await this.waitForNetworkIdle();
  }

  async search(query: string): Promise<void> {
    await this.searchInput.fill(query);
    await this.searchInput.press('Enter');
  }

  async expectSearchInputVisible(): Promise<void> {
    await expect(this.searchInput).toBeVisible();
  }

  async expectIdleState(): Promise<void> {
    await expect(this.page.getByText('[ LISTO PARA BUSCAR ]')).toBeVisible();
  }

  async expectHasResults(): Promise<boolean> {
    try {
      const productLinks = this.resultsSection.locator('a[href^="/product/"]');
      const count = await productLinks.count();
      return count > 0;
    } catch {
      return false;
    }
  }

  async expectNoResults(): Promise<void> {
    await expect(this.noResultsMessage).toBeVisible();
  }

  async expectIsSearching(): Promise<void> {
    await expect(this.searchingMessage.first()).toBeVisible();
  }

  async clickCategoryFilter(categoryName: string): Promise<void> {
    await this.page.getByRole('button', { name: new RegExp(`Filtrar por categoría: ${categoryName}`, 'i') }).click();
  }

  async clickNextPage(): Promise<void> {
    const nextButton = this.page.getByRole('button', { name: /NEXT >>|>>/i);
    if (await nextButton.isVisible()) {
      await nextButton.click();
      await this.page.waitForURL(/page=2/);
    }
  }

  async getResultCount(): Promise<number> {
    const countText = await this.page.getByText(/RESULTADOS: \d+ ITEMS/i).textContent();
    const match = countText?.match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
  }
}