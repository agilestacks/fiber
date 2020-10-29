## Kubernetes cluster cost metrics

Fiber is a Kubernetes operator to manage [Korral] cost collector deployments and [Prometheus] configuration.

For each [Cluster](crds/cluster.yaml) custom resource installed, Fiber do two things:

1. It connects to the cluster and deploys [Korral] cost collector that is configured to export cost metrics of that cluster.
2. It changes Promethes Operator [Prometheus custom resource] to add cluster instance to `korral` Prometheus job.


### Korral deployment

When new Cluster resource is detected, Fiber connects to the cluster and installs [Korral]. It periodically checks for health via Korral Service `/ping` resource. If HTTP 404 is received then it will reinstall the Korral. Other return codes - including 3xx, 4xx, and 5xx, indicated the software is installed.


### Prometheus reconfiguration.

When new Cluster resource is detected (or removed), Fiber changes Prometheus custom resource to add or modify `korral` job so that cluster Kubernetes API `/api/v1/namespaces/monitoring/services/korral:9797/proxy/metrics` is scraped. As there could be many clusters providing metrics to single Prometheus, each cluster get it's own `domain` metric label that is used by [Bumper] API / UI to filter timeseries.


### HTTP API

Fiber optionally works with [Bumper] that bridges Prometheus metrics and Cluster custom resources to HTTP API.


### Status

Cluster status from the Fiber point of view (Korral `/ping`) and Prometheus point of view (are there cost metrics in the cluster?) is posted back into custom resource under `status: {}`.


[Prometheus]: https://prometheus.io/
[Korral]: https://github.com/agilestacks/korral
[Bumper]: https://github.com/agilestacks/bumper
[Prometheus custom resource]: https://github.com/prometheus-operator/prometheus-operator/blob/master/Documentation/design.md
