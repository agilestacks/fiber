package v1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

type KubernetesAPI struct {
	Endpoint   string `json:"endpoint"`
	CaCert     string `json:"caCert,omitempty"`
	Token      string `json:"token,omitempty"`
	ClientCert string `json:"clientCert,omitempty"`
	ClientKey  string `json:"clientKey,omitempty"`
}

// Kubernetes API connection parameters
type Kubernetes struct {
	API KubernetesAPI `json:"api"`
	// https://github.com/kubernetes-sigs/controller-tools/issues/442
}

type KorralOptions struct {
	Install bool `json:"install"`
}

// Options for Operator fine-tuning
type Options struct {
	Korral KorralOptions `json:"korral"`
}

// ClusterSpec defines the desired state of Cluster
type ClusterSpec struct {
	Domain     string     `json:"domain"`
	Kubernetes Kubernetes `json:"kubernetes"`
	Options    *Options   `json:"options,omitempty"`
}

// ClusterStatus defines the observed state of Cluster
type ClusterStatus struct {
	Status     string `json:"status,omitempty"`
	Korral     string `json:"korral,omitempty"`
	Prometheus string `json:"prometheus,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status

// Cluster is the Schema for the clusters API
type Cluster struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   ClusterSpec   `json:"spec,omitempty"`
	Status ClusterStatus `json:"status,omitempty"`
}

// +kubebuilder:object:root=true

// ClusterList contains a list of Cluster
type ClusterList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []Cluster `json:"items"`
}

func init() {
	SchemeBuilder.Register(&Cluster{}, &ClusterList{})
}
