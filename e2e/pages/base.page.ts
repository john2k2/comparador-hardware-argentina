import { Page, Locator, expect } from '@playwright/test';

export abstract class BasePage {
  constructor(readonly page: Page) {}

  abstract goto(): Promise<void>;

  async getTitle(): Promise<string> {
    return this.page.title();
  }

  async waitForNetworkIdle(timeout = 5000): Promise<void> {
    await this.page.waitForLoadState('networkidle', { timeout });
  }
}

export class NavigationComponent {
  readonly logo: Locator;
  readonly searchInput: Locator;
  readonly loginButton: Locator;
  readonly darkModeButton: Locator;

  constructor(page: Page) {
    this.logo = page.getByRole('link', { name: /hardwarear/i });
    this.searchInput = page.getByPlaceholder(/\[ BUSCAR PRODUCTO/i);
    this.loginButton = page.getByRole('link', { name: /iniciar sesion|login/i });
    this.darkModeButton = page.getByRole('button', { name: /modo oscuro/i });
  }

  async search(query: string): Promise<void> {
    await this.searchInput.fill(query);
    await this.searchInput.press('Enter');
  }
}

export class FooterComponent {
  readonly container: Locator;
  readonly categoryLinks: Locator;
  readonly storeLinks: Locator;
  readonly infoLinks: Locator;

  constructor(page: Page) {
    this.container = page.getByRole('contentinfo');
    this.categoryLinks = this.container.getByRole('link', { name: /procesadores|tarjetas graficas|motherboards|memoria ram|perifericos/i });
    this.storeLinks = this.container.getByRole('link', { name: /mexx|venex|fullh4rd|compragamer|katech/i });
    this.infoLinks = this.container.getByRole('link', { name: /acerca|politica de privacidad|terminos|contacto/i });
  }

  async clickCategory(categoryName: string): Promise<void> {
    await this.container.getByRole('link', { name: categoryName }).click();
  }

  async clickStore(storeName: string): Promise<void> {
    await this.container.getByRole('link', { name: storeName }).click();
  }
}