import os

from fabric.api import task, env
from bookshelf.api_v1 import (create_server,
                              load_state_from_disk)


class UbuntuEC2CloudInstance():
    def __init__(self, instance_name, description, tag):
        self._initialise_from_env()
        self._configure(instance_name, description, tag)

    def _initialise_from_env(self):
        self._instance_type = os.getenv('AWS_INSTANCE_TYPE', 't2.medium')
        self._key_filename = os.environ['AWS_KEY_FILENAME']  # path to ssh key
        self._key_pair = os.environ['AWS_KEY_PAIR']
        self._region = os.getenv('AWS_REGION', 'us-west-2')
        self._secret_access_key = os.environ['AWS_SECRET_ACCESS_KEY']
        self._access_key_id = os.environ['AWS_ACCESS_KEY_ID']
        self._key_filename = os.environ['AWS_KEY_FILENAME']


    def _configure(self, instance_name, description, tag):
        self._config = {
            'ami': 'ami-87bea5b7',
            'username': 'ubuntu',
            'disk_name': '/dev/sda1',
            'disk_size': '40',
            'instance_type': self._instance_type,
            'key_pair': self._key_pair,
            'region': self._region,
            'secret_access_key': self._secret_access_key,
            'access_key_id': self._access_key_id,
            'security_groups': ['ssh'],
            'instance_name': instance_name,
            'description': description,
            'key_filename': self._key_filename,
            'tags': {'name': tag}
        }

    def start(self):
        env.user = self._config['username']
        env.key_filename = self._config['key_filename']
        create_server(cloud = 'ec2',
                      region = self._config['region'],
                      access_key_id = self._config['access_key_id'],
                      secret_access_key = self._config['secret_access_key'],
                      distribution = 'ubuntu14.04',
                      disk_name = self._config['disk_name'],
                      disk_size = self._config['disk_size'],
                      ami = self._config['ami'],
                      key_pair = self._config['key_pair'],
                      instance_type = self._config['instance_type'],
                      instance_name = self._config['instance_name'],
                      username = self._config['username'],
                      security_groups = self._config['security_groups'],
                      tags = self._config['tags'])


class MyCookbooks():
    """
    Collection of helper functions for fabric tasks.
    """

    def required_packages(self):
        return [
            "git"
        ]

    def start_github_handler_instance(self):
        instance_name = 'github_pr_handler'
        description = \
            'Receive requests from Github and trigger the appropriate jobs'
        tag = 'github_pr_handler'
        instance = UbuntuEC2CloudInstance(instance_name, description, tag)
        instance.start()

        # install git
        # clone package
        # install docker
        # start docker container with relevant parameters

@task(default=True)
def help():
    print("""
          This will start the Github PR handler somewhere..
          """)

@task
def down(cloud=None):
    """ halt an existing instance """
    data = load_state_from_disk()
    region = data['region']
    cloud_type = data['cloud_type']
    distribution = data['distribution'] + data['os_release']['VERSION_ID']
    access_key_id = C[cloud_type][distribution]['access_key_id']
    secret_access_key = C[cloud_type][distribution]['secret_access_key']
    instance_id = data['id']
    env.key_filename = C[cloud_type][distribution]['key_filename']

    cookbook = MyCookbooks()
    if data['cloud_type'] == 'ec2':
        cookbook.ec2()
    if data['cloud_type'] == 'rackspace':
        cookbook.rackspace()
    f_down(cloud=cloud_type,
           instance_id=instance_id,
           region=region,
           access_key_id=access_key_id,
           secret_access_key=secret_access_key)

@task
def it(distribution):
    bootstrap(distribution)

@task
def bootstrap(distribution):
    cookbook = MyCookbooks()

    cookbook.start_github_handler_instance()


# Modify some global Fabric behaviours:
# Let's disable known_hosts, since on Clouds that behaviour can get in the
# way as we continuosly destroy/create boxes.
env.disable_known_hosts = True
env.use_ssh_config = False
env.eagerly_disconnect = True
env.connection_attemtps = 5
env.user = 'root'
