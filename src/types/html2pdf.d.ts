declare module 'html2pdf.js' {
  interface Html2PdfOptions {
    margin?: number | number[];
    filename?: string;
    image?: { type?: string; quality?: number };
    enableLinks?: boolean;
    html2canvas?: any;
    jsPDF?: any;
    pagebreak?: { mode?: string | string[]; before?: string | string[]; after?: string | string[]; avoid?: string | string[] };
  }
  interface Html2Pdf {
    set(options: Html2PdfOptions): Html2Pdf;
    from(element: HTMLElement | string): Html2Pdf;
    save(filename?: string): Promise<void>;
    toPdf(): Html2Pdf;
    output(type?: string, options?: any): Promise<any>;
    then(callback: (...args: any[]) => any): Html2Pdf;
  }
  function html2pdf(): Html2Pdf;
  export default html2pdf;
}