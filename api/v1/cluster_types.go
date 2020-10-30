package v1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// Kubernetes API connection parameters
type Kubernetes struct {
	API struct {
		Endpoint   string `json:"endpoint"`
		CaCert     string `json:"caCert,omitempty"`
		Token      string `json:"token,omitempty"`
		ClientCert string `json:"clientCert,omitempty"`
		ClientKey  string `json:"clientKey,omitempty"`
	} `json:"api"`
}

// Options for Operator fine-tuning
type Options struct {
	Korral struct {
		Install bool `json:"install"`
	} `json:"korral"`
}

// ClusterSpec defines the desired state of Cluster
type ClusterSpec struct {
	Domain     string     `json:"domain"`
	Kubernetes Kubernetes `json:"kubernetes"`
	Options    Options    `json:"options"`
}

// ClusterStatus defines the observed state of Cluster
type ClusterStatus struct {
	Status     string `json:"status,omitempty"`
	Korral     string `json:"korral,omitempty"`
	Prometheus string `json:"prometheus,omitempty"`
}

// +kubebuilder:object:root=true

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
