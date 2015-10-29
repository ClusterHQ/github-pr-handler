import os
import yaml

from fabric.api import sudo, task, env
from fabric.context_managers import cd, settings, hide
from bookshelf.api_v1 import (apt_install,
                              create_docker_group,
                              create_server,
                              down as f_down,
                              ec2,
                              git_clone,
                              install_docker,
                              is_there_state,
                              load_state_from_disk,
                              log_green,
                              up as f_up)

from cuisine import (user_ensure,
                     group_ensure,
                     group_user_ensure)


class MyCookbooks():
    """
    Collection of helper functions for fabric tasks that are
    used for managing the Github PR Handler service.
    """

    def add_user_to_docker_group(self):
        """
        Make sure the ubuntu user is part of the docker group.
        """

        log_green('adding the ubuntu user to the docker group')
        data = load_state_from_disk()
        with settings(hide('warnings', 'running', 'stdout', 'stderr'),
                      warn_only=True, capture=True):
            user_ensure('ubuntu', home='/home/ubuntu', shell='/bin/bash')
            group_ensure('docker', gid=55)
            group_user_ensure('docker', 'ubuntu')

    def build_docker_image(self, dockerfile, image_name):
        """
        Build a Dockerfile with a given tag.

        :param dockerfile: The path of the Dockerfile to build.
        :param image_name: The name to give to the created image.
        """

        cmd = ('docker build -t {image_name} {dockerfile}').format(
            image_name=image_name,
            dockerfile=dockerfile
        )
        sudo(cmd)

    def install_docker(self):
        create_docker_group()
        self.add_user_to_docker_group()
        install_docker()

    def install_packages(self):
        """
        Install required packages.
        """

        apt_install(packages=self.required_packages())
        self.install_docker()

    def required_packages(self):
        """
        :return list: The required packages for this instance.
        """

        return [ "git" ]

    def secrets(self):
        """
        Load the secrets file.

        :return dict: The secrets contained within the file.
        """

        return yaml.load(open('segredos/ci-platform/all/all.yaml', 'r'))

    def start_github_handler_instance(self):
        """
        Start the Github PR Handler service.
        """

        repo = 'github-pr-handler'
        git_clone('https://github.com/ClusterHQ/github-pr-handler',
                  repo)

        with cd(repo):
            self.build_docker_image(os.path.curdir, repo)
            secrets = self.secrets()['env']['default']['github_pr_handler']
            cmd = ('docker run '
                   '-p {port}:{port} '
                   '-e GITHUB_SECRET={github_secret} '
                   '-e JENKINS_USERNAME={jenkins_username} '
                   '-e JENKINS_API_TOKEN={jenkins_api_token} '
                   '{image} '
                   '-p {port} '
                   '-u {jenkins_server}'
                  ).format(
                      port=secrets['port'],
                      image=repo,
                      github_secret=secrets['github_secret'],
                      jenkins_username=secrets['username'],
                      jenkins_api_token=secrets['api_token'],
                      jenkins_server=secrets['jenkins_url']
                  )
            sudo(cmd)


cloud_config = {
    'ami': 'ami-87bea5b7',
    'username': 'ubuntu',
    'disk_name': '/dev/sda1',
    'disk_size': '40',
    'instance_type': os.getenv('AWS_INSTANCE_TYPE', 't2.micro'),
    'key_pair': os.environ['AWS_KEY_PAIR'],
    'region': os.getenv('AWS_REGION', 'us-west-2'),
    'secret_access_key': os.environ['AWS_SECRET_ACCESS_KEY'],
    'access_key_id': os.environ['AWS_ACCESS_KEY_ID'],
    'security_groups': ['ssh', 'github_pr_handler'],
    'instance_name': 'github_pr_handler',
    'description': 'Receive requests from Github and triggers jobs on Jenkins',
    'key_filename': os.environ['AWS_KEY_FILENAME'],
    'tags': {'name': 'github_pr_handler'}
}

@task(default=True)
def help():
    """
    Print the help text.
    """

    help_text = (
    """
    Start an AWS instance that is running the Github PR handler

    usage: fab <action>

    # Start the service
    $ fab it

    # Provision and start the AWS instance if it does not exist,
    # otherwise start an existing instance.
    $ fab up

    # Suspend the instance.
    $ fab down
    """
    )
    print help_text

@task
def down():
    """
    Halt an existing instance.
    """

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
    """
    Boots a new Ubuntu instance on AWS, or start the existing instance.
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
def it():
    up()
    bootstrap()

@task
def bootstrap():
    cookbook = MyCookbooks()

    cookbook.install_packages()
    cookbook.start_github_handler_instance()


# Modify some global Fabric behaviours:
# Let's disable known_hosts, since on Clouds that behaviour can get in the
# way as we continuosly destroy/create boxes.
env.disable_known_hosts = True
env.use_ssh_config = False
env.eagerly_disconnect = True
env.connection_attemtps = 5
env.user = 'root'

if is_there_state():
    data = load_state_from_disk()
    env.hosts = data['ip_address']
    env.cloud = data['cloud_type']
