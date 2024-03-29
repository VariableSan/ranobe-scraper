import { RequestHandler } from 'express'
import fs from 'fs'
import { Logger } from 'tslog'
import { autoInjectable } from 'tsyringe'
import { v4 } from 'uuid'
import InfinitenoveltranslationsService from '../services/Infinitenoveltranslations.service'
import TempDBService from '../services/shared/ChaptersDB.service'
import DBmodelService from '../services/shared/DBmodel.service'
import EpubGenService from '../services/shared/EpubGen.service'
import UtilsService from '../services/shared/Utils.service'
import { ERanobeServices } from '../tools/enums/Services.enum'
import {
  IDefaultChaptersQuery,
  IDefaultDownloadBody,
  IDefaultReaderContainer,
  IEpubMetaData,
  IRanobe
} from '../tools/interfaces/Common.interface'
import { IRanobeController } from '../tools/interfaces/Services.interface'

@autoInjectable()
export default class InfinitenoveltranslationsController
  implements IRanobeController
{
  dbModel: DBmodelService
  private logger = new Logger()

  constructor(
    private infinitenoveltranslationsService: InfinitenoveltranslationsService,
    private tempDBService: TempDBService,
    private utils: UtilsService
  ) {
    this.dbModel = new DBmodelService(ERanobeServices.INFINITENOVELTRANSLATIONS)
  }

  ranobeList(): RequestHandler {
    return async (req, res) => {
      try {
        const localList = this.dbModel.getLocalList()
        if (localList.length) {
          return res.json(localList)
        }
      } catch (error) {
        this.logger.error(error)
      }

      let ranobeList: IRanobe[] = []

      const connectionUid = v4()
      req.on('close', () => {
        this.utils.removeProcess(connectionUid)
      })

      try {
        ranobeList = await this.infinitenoveltranslationsService.ranobeList(
          connectionUid
        )

        try {
          if (ranobeList.length) {
            await this.dbModel.setLocalList(ranobeList)
          }
        } catch (err) {
          this.logger.error(err)
        }

        return res.json(ranobeList)
      } catch (error) {
        this.logger.error(error)
      }

      res.sendStatus(500)
    }
  }

  chapters(): RequestHandler {
    return async (req, res) => {
      const { href, title, reload } =
        req.query as unknown as IDefaultChaptersQuery

      if (!href) {
        return res.sendStatus(500)
      }

      if (!reload) {
        const chapters = await this.dbModel.getChapters(title)
        if (chapters) return res.json(chapters)
      }

      const connectionUid = v4()
      req.on('close', () => {
        this.utils.removeProcess(connectionUid)
      })

      try {
        const composition =
          await this.infinitenoveltranslationsService.chapters(
            href,
            connectionUid
          )
        if (composition) {
          await this.dbModel.setChapters(
            title,
            composition.chapters,
            href,
            composition.cover
          )
          return res.json(composition)
        }
      } catch (err) {
        this.logger.error(err)
      }

      res.sendStatus(500)
    }
  }

  download(): RequestHandler {
    return async (req, res) => {
      const { ranobeHrefList, reload, title } = req.body as IDefaultDownloadBody

      const { start, end } =
        this.infinitenoveltranslationsService.getChaptersRange(ranobeHrefList)

      const fileName = this.utils.tempRanobePattern(title, start, end)

      const connectionUid = v4()
      req.on('close', () => {
        this.utils.removeProcess(connectionUid)
      })

      // todo: необходимо сделать общий сервис для генерации ранобе
      try {
        let file
        if (!reload && fs.existsSync(fileName)) {
          file = JSON.parse(fs.readFileSync(fileName).toString())
        }

        let readerContainer: IDefaultReaderContainer[]

        if (!file) {
          readerContainer =
            await this.infinitenoveltranslationsService.download(
              ranobeHrefList,
              connectionUid
            )
        } else {
          readerContainer = file
        }

        const metadata: IEpubMetaData = {
          title,
          cover: 'cover.jpg',
          images: []
        }

        await this.tempDBService.saveRanobeData(
          { title, start, end },
          readerContainer
        )

        const epubGenService = new EpubGenService(
          metadata,
          readerContainer,
          start,
          end
        )

        const [filePath, filename] = await epubGenService.generate()

        return res.sendFile(filePath, {
          fileName: filename
        })
      } catch (error) {
        this.logger.error(error as Error)
      }

      res.sendStatus(500)
    }
  }
}
