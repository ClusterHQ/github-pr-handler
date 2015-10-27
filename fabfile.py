import os

from fabric.api import task, env
from bookshelf.api_v1 import (create_server,
                              down as f_down,
                              ec2,
                              is_there_state,
                              load_state_from_disk,
                              up as f_up)


class MyCookbooks():
    """
    Collection of helper functions for fabric tasks.
    """

    def required_packages(self):
        return [
            "git"
        ]

    def start_github_handler_instance(self):
        pass
        # install git
        # clone package
        # install docker
        # start docker container with relevant parameters

cloud_config = {
    'ami': 'ami-87bea5b7',
    'username': 'ubuntu',
    'disk_name': '/dev/sda1',
    'disk_size': '40',
    'instance_type': os.getenv('AWS_INSTANCE_TYPE', 't2.medium'),
    'key_pair': os.environ['AWS_KEY_PAIR'],
    'region': os.getenv('AWS_REGION', 'us-west-2'),
    'secret_access_key': os.environ['AWS_SECRET_ACCESS_KEY'],
    'access_key_id': os.environ['AWS_ACCESS_KEY_ID'],
    'security_groups': ['ssh'],
    'instance_name': 'github_pr_handler',
    'description': 'Receive requests from Github and triggers jobs on Jenkins',
    'key_filename': os.environ['AWS_KEY_FILENAME'],
    'tags': {'name': 'github_pr_handler'}
}

@task(default=True)
def help():
    print("""
          This will start the Github PR handler somewhere..
          """)

@task
def down():
    """ halt an existing instance """
    data = load_state_from_disk()
    region = data['region']
    cloud_type = data['cloud_type']
    distribution = data['distribution'] + data['os_release']['VERSION_ID']
    access_key_id = cloud_config['access_key_id']
    secret_access_key = cloud_config['secret_access_key']
    instance_id = data['id']
    env.key_filename = cloud_config['key_filename']

    ec2()
    f_down(cloud=cloud_type,
           instance_id=instance_id,
           region=region,
           access_key_id=access_key_id,
           secret_access_key=secret_access_key)

@task
def up():
    """ boots a new instance on amazon or rackspace
    """

    if is_there_state():
        data = load_state_from_disk()
        cloud_type = data['cloud_type']
        username = data['username']
        distribution = data['distribution'] + data['os_release']['VERSION_ID']
        region = data['region']
        access_key_id = cloud_config['access_key_id']
        secret_access_key = cloud_config['secret_access_key']
        instance_id = data['id']
        env.user = data['username']
        env.key_filename = cloud_config['key_filename']

        ec2()

        f_up(cloud=cloud_type,
             region=region,
             instance_id=instance_id,
             access_key_id=access_key_id,
             secret_access_key=secret_access_key,
             username=username)
    else:
        env.user = cloud_config['username']
        env.key_filename = cloud_config['key_filename']

        # no state file around, lets create a new VM
        # and use defaults values we have in our 'cloud_config' dictionary
        create_server(cloud='ec2',
                      region=cloud_config['region'],
                      access_key_id=cloud_config['access_key_id'],
                      secret_access_key=cloud_config[
                          'secret_access_key'],
                      distribution='ubuntu14.04',
                      disk_name=cloud_config['disk_name'],
                      disk_size=cloud_config['disk_size'],
                      ami=cloud_config['ami'],
                      key_pair=cloud_config['key_pair'],
                      instance_type=cloud_config['instance_type'],
                      instance_name=cloud_config['instance_name'],
                      username=cloud_config['username'],
                      security_groups=cloud_config[
                          'security_groups'],
                      tags=cloud_config['tags'])

@task
def it(distribution):
    up()
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
