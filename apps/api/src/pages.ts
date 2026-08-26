export interface PublicPageOptions {
  appSlug?: string;
  contactEmail?: string;
}

const styles = `
  body { font: 16px/1.6 system-ui, sans-serif; color: #171717; margin: 0; }
  main { max-width: 720px; margin: 0 auto; padding: 3rem 1.25rem; }
  h1, h2 { line-height: 1.2; }
  a { color: #2457d6; }
  footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #ddd; }
  footer a { margin-right: 1rem; }
`;

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character] ?? character);
}

function footer(): string {
  return '<footer><a href="/privacy">Privacy</a><a href="/terms">Terms</a></footer>';
}

function page(title: string, content: string): Response {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${styles}</style></head><body><main>${content}${footer()}</main></body></html>`, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function contact(options: PublicPageOptions): string {
  if (options.contactEmail) {
    const email = escapeHtml(options.contactEmail);
    return `Questions may be sent to <a href="mailto:${email}">${email}</a>.`;
  }
  return 'Contact information for this early-stage service will be published here before public availability.';
}

export function landingPage(options: PublicPageOptions): Response {
  const install = options.appSlug
    ? `<p><a href="https://github.com/apps/${encodeURIComponent(options.appSlug)}/installations/new"><strong>Install Spark on GitHub</strong></a></p>`
    : '<p>GitHub App installation is not configured for this environment.</p>';
  return page('Spark Observability', `<h1>Spark Observability</h1><p>See what a pull request touches and where attention is needed.</p>${install}`);
}

export function privacyPage(options: PublicPageOptions): Response {
  return page('Spark Privacy', `
    <h1>Privacy</h1>
    <p><em>Last updated: 26 August 2026</em></p>
    <p>Spark is an early-stage software-change observability service.</p>
    <h2>Information Spark processes</h2>
    <p>Spark processes GitHub repository metadata, pull-request and change information, changed file paths, relevant repository context, and GitHub Check information as needed to produce an evaluation. It may read limited repository files, such as workspace manifests, while resolving project relationships.</p>
    <h2>Information Spark stores</h2>
    <p>Spark stores GitHub App installation and repository identifiers, webhook delivery identifiers, and evaluation metadata such as pull-request number, exact commit SHA, attention level, and Spark Check Run identifier.</p>
    <p>Spark does not intentionally persist GitHub installation access tokens. It does not persist full repository source code or complete diffs as part of the normal V0 evaluation record.</p>
    <h2>Removing access</h2>
    <p>You can remove the GitHub App installation or its access to repositories through GitHub. Removal stops future authorized access; limited operational metadata may remain where needed to operate or diagnose the early-stage service.</p>
    <h2>Changes and contact</h2>
    <p>This notice may change as Spark develops. ${contact(options)}</p>
  `);
}

export function termsPage(options: PublicPageOptions): Response {
  return page('Spark Terms', `
    <h1>Terms</h1>
    <p><em>Last updated: 26 August 2026</em></p>
    <p>Spark is an early-stage service provided as a software-change observability aid.</p>
    <h2>No correctness or security guarantee</h2>
    <p>Spark evaluations may be incomplete, unavailable, or incorrect. They do not guarantee that software is correct, secure, tested, or safe to deploy. You remain responsible for code review and all merge, release, and deployment decisions.</p>
    <h2>Acceptable use</h2>
    <p>Do not misuse the service, interfere with its operation, attempt unauthorized access, or use it in violation of applicable law or third-party rights. You must have authority to install Spark on and grant it access to a repository.</p>
    <h2>Service changes</h2>
    <p>Spark may change, suspend, or discontinue features while the product is being developed. ${contact(options)}</p>
  `);
}
