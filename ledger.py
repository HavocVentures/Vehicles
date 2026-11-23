"""Vehicle facts and readiness. Persist only accepted facts. Inputs use ISO dates and AUD."""
from datetime import date as vehicle_date
from decimal import Decimal as VehicleDecimal, InvalidOperation as VehicleInvalid
from uuid import UUID as VehicleUUID

VEHICLE_TYPES = ('payment', 'expiry', 'renewal', 'service', 'fault', 'repair', 'followup', 'meter')
VEHICLE_FIELDS = ('kind', 'label', 'day', 'amount', 'reading', 'unit', 'nextDay', 'nextReading', 'target')

def vehicle_fact(data):
    if not isinstance(data, dict):
        raise ValueError('Check the proposed entry.')
    result = {k: str(data.get(k) or '').strip() for k in VEHICLE_FIELDS}
    if result['kind'] not in VEHICLE_TYPES or not 0 < len(result['label']) <= 600:
        raise ValueError('Choose an entry type and describe the work or payment.')
    for key in ('day','nextDay'):
        if result[key] and vehicle_date.fromisoformat(result[key]).isoformat() != result[key]:
            raise ValueError('Use a valid date.')
    if result['kind'] in ('expiry','payment') and not result['day']:
        raise ValueError('Confirm the expiry or payment date.')
    for key in ('amount','reading','nextReading'):
        raw = result[key]
        if raw:
            try: val = VehicleDecimal(raw)
            except VehicleInvalid: raise ValueError('Enter a valid amount or meter reading.')
            if len(raw)>15 or not val.is_finite() or val<0 or val>999999999 or val.as_tuple().exponent < -2:
                raise ValueError('Enter a positive amount with up to two decimal places.')
            result[key]=format(val,'f')
    if result['unit'] not in ('','km','h') or ((result['reading'] or result['nextReading']) and not result['unit']):
        raise ValueError('Choose kilometres or engine hours for the reading.')
    if result['reading'] and not result['day']:
        raise ValueError('Add the date of the meter reading.')
    if result['target']:
        if result['kind'] not in ('repair','payment') or str(VehicleUUID(result['target'])) != result['target']:
            raise ValueError('Choose an open item to resolve.')
    return result

def vehicle_assessment(events, registration, today, held):
    latest=lambda group:max(group,key=lambda e:(e.get('day') or '',e.get('at','')),default={})
    payments=[e for e in events if e['kind']=='payment']
    paid=latest(payments)
    # Use the latest confirmation, including a correction that shortens an expiry.
    expiries=[e for e in events if e['kind']=='expiry']
    expiry=max(expiries,key=lambda e:e.get('at',''),default={}).get('day','')
    resolved={e.get('target') for e in events if e['kind'] in ('repair','payment')}
    outstanding=[e for e in events if e['kind'] in ('fault','followup','renewal') and e['id'] not in resolved]
    reasons=[]
    def flag(state,reason): reasons.append((state,reason))
    if held: flag('grounded',held)
    if registration and not expiry: flag('check','Confirm registration status and expiry')
    last_confirmation=max((e.get('at','') for e in expiries),default='')
    if registration and expiry and paid and paid.get('at','')>last_confirmation:
        flag('caution','Confirm the new expiry for the latest rego payment')
    if registration and expiry and expiry<today: flag('grounded','Confirmed registration period has ended. Check renewal before road use.')
    for event in outstanding:
        flag('check' if event['kind']=='fault' else 'caution',event['label'])
    service=latest([e for e in events if e['kind']=='service'])
    meter={}
    for unit in ('km','h'):
        observed=latest([e for e in events if e.get('unit')==unit and e.get('reading') and e.get('day')])
        if observed:meter[unit]=observed
    if service.get('nextDay') and service['nextDay']<=today: flag('caution','Service due by date')
    if service.get('nextReading'):
        observed=meter.get(service.get('unit'),{})
        if not observed:flag('check','Record a current meter reading for servicing')
        elif VehicleDecimal(observed['reading'])>=VehicleDecimal(service['nextReading']):flag('caution','Service due at the recorded meter reading')
        elif (vehicle_date.fromisoformat(today)-vehicle_date.fromisoformat(observed['day'])).days>30:
            flag('check','Update the meter reading to check the service interval')
    rank={'grounded':0,'check':1,'caution':2}
    reasons.sort(key=lambda item:rank[item[0]])
    return {'state':reasons[0][0] if reasons else 'ready','nextAction':reasons[0][1] if reasons else 'No outstanding action',
            'reasons':[reason for _,reason in reasons],'lastPayment':paid or None,'expiry':expiry,'service':service or None,'meters':meter,'open':outstanding}

