package controllers

import (
	"context"

	"github.com/go-logr/logr"
	"k8s.io/apimachinery/pkg/runtime"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"

	kushionv1 "github.com/agilestacks/fiber/api/v1"
)

// ClusterReconciler reconciles a Cluster object
type ClusterReconciler struct {
	client.Client
	Log    logr.Logger
	Scheme *runtime.Scheme
}

// +kubebuilder:rbac:groups=kushion.agilestacks.com,resources=clusters,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=kushion.agilestacks.com,resources=clusters/status,verbs=get;update;patch

func (r *ClusterReconciler) Reconcile(req ctrl.Request) (ctrl.Result, error) {
	// https://book.kubebuilder.io/cronjob-tutorial/controller-implementation.html

	ctx := context.Background()
	log := r.Log.WithValues("cluster", req.NamespacedName)

	var cluster kushionv1.Cluster
	if err := r.Get(ctx, req.NamespacedName, &cluster); err != nil {
		log.Error(err, "unable to fetch Cluster")
		return ctrl.Result{}, client.IgnoreNotFound(err)
	}

	log.V(1).Info("got cluster", "obj", cluster)

	cluster.Status = kushionv1.ClusterStatus{Status: "seen"}

	if err := r.Status().Update(ctx, &cluster); err != nil {
		log.Error(err, "unable to update Cluster status")
		return ctrl.Result{}, err
	}

	return ctrl.Result{}, nil
}

func (r *ClusterReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&kushionv1.Cluster{}).
		Complete(r)
}
