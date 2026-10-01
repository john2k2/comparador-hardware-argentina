/** Tokens sin resolver de plantillas de tienda no identifican una publicación. */
export function isUnresolvedSourceTitle(title: string): boolean {
  return /§|\{\{|<%|\bITEMTIT\b/i.test(title);
}
