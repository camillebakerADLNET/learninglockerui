import logger from 'lib/logger';
import { v4 as uuidv4 } from 'uuid';

export default (err) => {
  const errorId = uuidv4();
  logger.error(errorId, err);
};
