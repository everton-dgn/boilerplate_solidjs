type SiteSection = { title: string; paragraphs: string[] }

export type SiteLink = { label: string; href: string }

export type SitePage = {
  title: string
  intro: string
  sections: SiteSection[]
  links: SiteLink[]
}
