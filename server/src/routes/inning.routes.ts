import express from 'express'
import { changeBowler, compleateInning,  getInningById, getInningsByMatchId, startInning, startSecondInning, updatScore,setOpeningPlayers } from '../controllers/inning.controller';

const router = express.Router();

router.post('/start/:matchId', startInning);
router.post('/updatescore/:id', updatScore);
router.post('/compleate/:id', compleateInning);
router.get('/:id', getInningById);
router.put('/change-bowler/:inningId', changeBowler);
router.get('/match/:matchId', getInningsByMatchId);
router.post('/secstart/:matchId', startSecondInning);
router.put('/set-opening/:inningId', setOpeningPlayers);

export default router; 



