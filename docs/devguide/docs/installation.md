# Installing Predator

Before Predator, running two or more tests simultaneously was limited due to third party limitations. Now, you are able to scale tests using our own resources. With support for both Kubernetes and Metronome, all you need to do is provide the platform configuration, sit back, and let Predator deploy runners that load your API from your chosen platform. 

You're probably eager to get your hands dirty, so let's go ahead and install Predator.

## Important Deployment Tips
Predator is production ready and fully tested and can be deployed in all of the following platforms listed. Please follow these guidelines when deploying Predator:

1. Deploy Predator using only tagged releases and not `latest`.

2. Predator-Runner docker image version (`ghcr.io/predator-oss/predator-runner:$TAGGED_VERSION`) must match the Predator's `major.minor` version running in order to be fully compatible with all features. Patched versions don't have to match, but it is recommended to use latest patch version.
    - For example, Predator 1.8.x (`ghcr.io/predator-oss/predator:1.8`) runs Predator-Runner 1.8.x (`ghcr.io/predator-oss/predator-runner:1.8`).

## Kubernetes

Install Predator from the [predator-oss helm repository](https://github.com/predator-oss/helm-charts):

```bash
helm repo add predator-oss https://predator-oss.github.io/helm-charts
helm install predator predator-oss/predator
```  

## DC/OS

Predator can be installed through DC/OS Universe within the cluster.
<br>
For examples and more info check [Universe Catalog](https://universe.dcos.io/#/package/predator/version/latest)

## Docker

Predator runs in a docker and when installing it using ```Docker```, Predator creates and runs other dockers which actually create the load (predator-runner).
In order to avoid DIND, Predator will start its runners as siblings using the docker daemon socket.

<b>Command:</b>

<b>Without persisted storage:</b>

```docker run -d -e JOB_PLATFORM=DOCKER -e INTERNAL_ADDRESS=http://$MACHINE_IP:80/v1 -p 80:80 --name predator -v /var/run/docker.sock:/var/run/docker.sock ghcr.io/predator-oss/predator:1.8```

<b>With persisted storage:</b>

```docker run -d -e SQLITE_STORAGE=db/predator -e JOB_PLATFORM=DOCKER -e INTERNAL_ADDRESS=http://$MACHINE_IP:80/v1 -p 80:80 --name predator -v /var/run/docker.sock:/var/run/docker.sock -v /tmp/predator:/usr/db ghcr.io/predator-oss/predator:1.8```

Explanations:

1. When starting Predator in a docker we will mount the docker socket to the container. This will allow Predator to start the siblings dockers (Predator-Runner). This is done as so:
<br>
```-v /var/run/docker.sock:/var/run/docker.sock``` 

2. When running tests, the Predator-Runners will have to reach the main Predator to report test results through their internal API. Therefore, Predator has to know it's own accessible address and pass it to the Predator-Runners for them to access Predator's API. This is done by setting the enviornment variable ```INTERNAL_ADDRESS``` as so:
<br> 
 ```-e INTERNAL_ADDRESS=http://$MACHINE_IP:80/v1```
   where `$MACHINE_IP` is the local ip address of your machine (not localhost, but actual ip address - it is your local network address).
   <br>In unix or mac this command should give you the ip address and set it to the MACHINE_IP variable:
   ```export MACHINE_IP=$(ipconfig getifaddr en0 || ifconfig eth0|grep 'inet addr:'|cut -d':' -f2|awk '{ print $1}')```

3. The environment variable ```JOB_PLATFORM``` is set to ```DOCKER``` so that Predator deploys the Predator-Runners as dockers on the machine it is running.

After successfully starting the Predator docker image, access Predator by typing the following URL in your browser:

```http://{$MACHINE_IP}/ui```

!!! note "If you don't see test reports"
   
    This usually means that the predator-runner couldn't reach the main Predator's API and update it about test progress;
    <br>
    ```docker logs $(docker ps -a -f name=predator -n 1 --format='{{ .ID }}')```
    <br>
    Will help to understand what went wrong.
