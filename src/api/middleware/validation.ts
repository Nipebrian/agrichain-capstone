import createHttpError from "http-errors"
import type { AnySchema } from "yup"
import type { Request, Response, NextFunction } from "express"

const validate =
  (schema: AnySchema) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = await schema.validate(req.body, { stripUnknown: false })
      next()
    } catch (err: any) {
      next(createHttpError(400, err.message))
    }
  }

export default validate
