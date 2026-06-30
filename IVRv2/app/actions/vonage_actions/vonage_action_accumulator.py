from app.base_classes.action import Action
from app.base_classes.action_accumulator import ActionAccumulator
from app.utils.sas_gen import SASGen

sas_gen_obj = SASGen()

class VonageActionAccumulator(ActionAccumulator):
    def combine(self, actions: list[Action]):
        return [x.get(sas_gen_obj) for x in actions]
        # raise NotImplementedError