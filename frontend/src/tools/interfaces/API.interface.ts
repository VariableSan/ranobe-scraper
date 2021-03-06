export interface IRanobe {
  title: string
  href: string
  cover: string
  chapters?: IChapter[]
}

export interface IChapter {
  title: string
  href: string
  author: string
  checked: boolean
  date: string
}

export interface IComposition {
  chapters: IChapter[]
  cover: string
}
