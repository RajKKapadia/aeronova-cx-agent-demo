"""Generate SIX independent, single-operation CX Agent Studio OpenAPI 3.0 YAMLs."""
from pathlib import Path
import yaml

class NoAliasDumper(yaml.SafeDumper):
    def ignore_aliases(self, data):
        return True

OUT = Path(__file__).parent / 'openapi'
SERVER = 'https://grateful-lemming-clearly.ngrok-free.app'

flight = {
    'type': 'object',
    'properties': {
        'flightId': {'type': 'string', 'example': 'AV418'},
        'origin': {'type': 'string', 'example': 'BOM'},
        'destination': {'type': 'string', 'example': 'DEL'},
        'date': {'type': 'string', 'format': 'date', 'example': '2026-12-15'},
        'scheduledDeparture': {'type': 'string', 'example': '11:15', 'description': 'Local airport time HH:mm'},
        'estimatedDeparture': {'type': 'string', 'nullable': True, 'example': '11:15'},
        'delayMinutes': {'type': 'integer', 'nullable': True, 'example': 0},
        'status': {'type': 'string', 'enum': ['on_time', 'delayed', 'cancelled']},
        'availableSeats': {'type': 'integer', 'example': 1}
    }
}
error = {'description': 'Error, response body contains error.code and error.message.', 'content': {'application/json': {'schema': {'type': 'object', 'properties': {'error': {'type': 'object', 'properties': {'code': {'type': 'string'}, 'message': {'type': 'string'}}}}}}}}
booking_ref_path = {'name': 'bookingRef', 'in': 'path', 'required': True, 'description': 'Fictional airline booking reference, e.g. AV2048.', 'schema': {'type': 'string', 'example': 'AV2048'}}
booking_ref_query = {'name': 'bookingRef', 'in': 'query', 'required': True, 'description': 'Fictional airline booking reference to find alternatives for.', 'schema': {'type': 'string', 'example': 'AV2048'}}

def response(description, schema, code='200'):
    return {code: {'description': description, 'content': {'application/json': {'schema': schema}}}}

def request(fields, required):
    return {'required': True, 'content': {'application/json': {'schema': {'type': 'object', 'required': required, 'properties': fields}}}}

def operation(name, title, path, method, summary, description, parameters=None, req=None, responses=None):
    o = {'tags': ['AeroNova Demo'], 'summary': summary, 'description': description, 'operationId': name}
    if parameters: o['parameters'] = parameters
    if req: o['requestBody'] = req
    o['responses'] = {**(responses or {}), '400': error, '404': error, '409': error, '422': error}
    spec = {'openapi': '3.0.3', 'info': {'title': title, 'version': '1.0.0', 'description': 'Fictional AeroNova airline demo; no real passenger or financial data.'}, 'servers': [{'url': SERVER, 'description': 'Replace URL with public HTTPS tunnel/deployment reachable by Google'}], 'paths': {path: {method: o}}}
    (OUT / f'{name}.yaml').write_text(yaml.dump(spec, Dumper=NoAliasDumper, sort_keys=False, allow_unicode=True, width=105), encoding='utf-8')

operation('get_booking', 'Get airline booking', '/api/bookings/{bookingRef}', 'get',
    'Get current reservation and original flight status',
    'Use first to retrieve the passenger and original/current flight details for a booking reference. Does not modify data.',
    parameters=[booking_ref_path], responses=response('Booking and flight details', {
        'type': 'object', 'properties': {
            'bookingRef': {'type': 'string'}, 'passenger': {'type': 'string'},
            'origin': {'type': 'string'}, 'destination': {'type': 'string'},
            'originalFlightId': {'type': 'string'}, 'currentFlightId': {'type': 'string'},
            'rebooked': {'type': 'boolean'}, 'originalFlight': flight, 'currentFlight': flight
        }
    }))

operation('get_alternative_flights', 'Find alternative flights', '/api/flights/alternatives', 'get',
    'Find available alternative flights for a booking',
    'Lists seats on the same route and date as the original disrupted flight. Show inventory as provisional until rebook_flight succeeds.',
    parameters=[booking_ref_query], responses=response('Available alternative flights', {
        'type': 'object', 'properties': {
            'bookingRef': {'type': 'string'}, 'alternatives': {'type': 'array', 'items': flight},
            'note': {'type': 'string'}
        }
    }))

operation('rebook_flight', 'Confirm passenger rebooking', '/api/bookings/{bookingRef}/rebook', 'post',
    'Change the passenger booking to a selected alternative',
    'HIGH IMPACT MUTATION. Call ONLY after the passenger explicitly confirms the exact alternative flight. Backend validates inventory and permits only one change for the demo. confirmed=true means the agent has received explicit user consent; this is not production-grade proof of authorization.',
    parameters=[booking_ref_path], req=request({
        'flightId': {'type': 'string', 'description': 'Exact offered flight ID selected by the passenger.', 'example': 'AV418'},
        'confirmed': {'type': 'boolean', 'description': 'Set true only after user explicitly confirms the exact proposed flight.', 'example': True}
    }, ['flightId', 'confirmed']), responses=response('Booking rebooked successfully or previously rebooked', {
        'type': 'object', 'properties': {
            'status': {'type': 'string'}, 'bookingRef': {'type': 'string'},
            'confirmationCode': {'type': 'string'}, 'newFlight': flight,
            'remainingSeats': {'type': 'integer'}
        }
    }))

operation('get_care_eligibility', 'Check meal-voucher eligibility', '/api/care/eligibility/{bookingRef}', 'get',
    'Evaluate eligibility based on original flight disruption',
    'Read-only eligibility for fictional AeroNova policy: one INR 800 meal voucher if original flight was cancelled or delayed 180+ minutes. Results stay valid after rebooking.',
    parameters=[booking_ref_path], responses=response('Fictional assistance policy decision', {
        'type': 'object', 'properties': {
            'bookingRef': {'type': 'string'}, 'originalFlightId': {'type': 'string'},
            'disruption': {'type': 'string'}, 'delayMinutes': {'type': 'integer', 'nullable': True},
            'policy': {'type': 'string'},
            'mealVoucher': {'type': 'object', 'properties': {
                'eligible': {'type': 'boolean'}, 'alreadyIssued': {'type': 'boolean'},
                'currency': {'type': 'string'}, 'amount': {'type': 'integer'}
            }}
        }
    }))

operation('issue_meal_voucher', 'Issue eligible meal voucher', '/api/care/vouchers', 'post',
    'Issue a one-time INR 800 meal voucher to a disrupted booking',
    'HIGH IMPACT MUTATION. First call get_care_eligibility. Ask passenger for explicit approval before calling. Backend enforces eligibility and prevents duplicate issuance.',
    req=request({
        'bookingRef': {'type': 'string', 'example': 'AV2048'},
        'type': {'type': 'string', 'enum': ['meal'], 'description': 'Only meal voucher is supported.'},
        'confirmed': {'type': 'boolean', 'description': 'True ONLY after passenger explicitly asks to issue this voucher.', 'example': True}
    }, ['bookingRef', 'type', 'confirmed']), responses=response('Voucher issued or previously issued', {
        'type': 'object', 'properties': {
            'status': {'type': 'string', 'enum': ['issued', 'already_issued']},
            'voucher': {'type': 'object', 'properties': {
                'voucherCode': {'type': 'string'}, 'bookingRef': {'type': 'string'},
                'type': {'type': 'string'}, 'amount': {'type': 'integer'},
                'currency': {'type': 'string'}, 'status': {'type': 'string'}
            }}
        }
    }))

operation('escalate_case', 'Create human support escalation', '/api/cases/escalate', 'post',
    'Open a human support case for an unresolved airline disruption',
    'Create a fictional human support case if no alternatives are available, the passenger requests human support, or an unsupported exception needs review. Never promise response time. Duplicate open case requests return the existing case.',
    req=request({
        'bookingRef': {'type': 'string', 'example': 'AV9000'},
        'reason': {'type': 'string', 'enum': ['no_alternatives', 'customer_requested', 'exception'], 'description': 'Select the reason that matches the passenger request.'},
        'summary': {'type': 'string', 'minLength': 12, 'maxLength': 400, 'description': 'Brief factual issue summary for the human team.'}
    }, ['bookingRef', 'reason', 'summary']), responses=response('Escalation case created or already open', {
        'type': 'object', 'properties': {
            'status': {'type': 'string'},
            'case': {'type': 'object', 'properties': {
                'caseId': {'type': 'string'}, 'bookingRef': {'type': 'string'},
                'reason': {'type': 'string'}, 'summary': {'type': 'string'},
                'queue': {'type': 'string'}, 'status': {'type': 'string'}
            }}
        }
    }))

if __name__ == '__main__':
    print('Generated 6 independent CX Agent Studio OpenAPI tool files:')
    for item in sorted(OUT.glob('*.yaml')):
        print(' -', item.name)
