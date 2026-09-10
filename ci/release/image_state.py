"""Small immutable image receipts for pushes that do not publish a Git Release."""
import json

from api import Api, ApiError
from model import enabled, env, require


def path(context, name):
    from model import version_tuple
    version_tuple(context['version'])
    return f'/api/packages/{env("GITEA_REPO").split("/")[0]}/generic/password-xl-image-state/{context["version"]}/{name}.json'


def api():
    return Api(env('GITEA_URL'), env('GITEA_TOKEN'))


def get(context, name):
    if not (context.get('push_images', False) or context.get('publish_release', False)):
        return None
    return api().maybe(path(context, name))


def put(context, name, value):
    if not context.get('push_images', False):
        return
    existing = get(context, name)
    require(existing is None or existing == value, 'Image publication state conflict: ' + name)
    if existing is not None:
        return
    try:
        api().request('PUT', path(context, name), json.dumps(value, sort_keys=True).encode(),
                      {'Content-Type': 'application/octet-stream'}, binary=True)
    except ApiError as error:
        if error.status != 409 or get(context, name) != value:
            raise


def reserve(context):
    put(context, 'source', {key: context[key] for key in ('version', 'source_sha')})


def check_source(context):
    existing = get(context, 'source')
    require(existing is None or existing == {key: context[key] for key in ('version', 'source_sha')},
            'Version already belongs to different image source; bump package.json')


def receipt(context, target):
    return get(context, 'receipt-' + target) or get(context, 'validated-' + target)
