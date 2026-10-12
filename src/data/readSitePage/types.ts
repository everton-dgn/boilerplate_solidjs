export type SiteLink = { label: string; href: string }

export type SiteSection = { title: string; paragraphs: string[] }

export type SitePage = {
  title: string
  description: string
  intro: string
  sections: SiteSection[]
  links: SiteLink[]
}
