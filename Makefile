.DEFAULT_GOAL := lint

export AWS_DEFAULT_REGION ?= us-east-2

COMPONENT_NAME ?= fiber

DOMAIN_NAME ?= test.dev.superhub.io
NAMESPACE   ?= monitoring

IMAGE_VERSION ?= $(shell git rev-parse HEAD | colrm 7)

HUB_USER  ?= agilestacks
HUB_PASS  ?= ~/.docker/agilestacks.txt
HUB_IMAGE ?= $(HUB_USER)/fiber

ECR_REGISTRY ?= $(subst https://,,$(lastword $(shell aws ecr get-login --region $(AWS_DEFAULT_REGION))))
ECR_IMAGE    ?= $(ECR_REGISTRY)/agilestacks/$(DOMAIN_NAME)/fiber

kubectl ?= kubectl --context=$(DOMAIN_NAME) --namespace=$(NAMESPACE)
docker  ?= docker
aws     ?= aws

deploy: build push kubernetes

build:
	@$(docker) build -t $(HUB_IMAGE):$(IMAGE_VERSION) .
.PHONY: build

push:
	$(aws) ecr get-login --region $(AWS_DEFAULT_REGION) --no-include-email | $(SHELL) -
	$(docker) tag  $(HUB_IMAGE):$(IMAGE_VERSION) $(ECR_IMAGE):$(IMAGE_VERSION)
	$(docker) tag  $(HUB_IMAGE):$(IMAGE_VERSION) $(ECR_IMAGE):latest
	$(docker) push $(ECR_IMAGE):$(IMAGE_VERSION)
	$(docker) push $(ECR_IMAGE):latest
.PHONY: push

korral-override:
	-$(kubectl) delete configmap $(COMPONENT_NAME)
	$(kubectl) create secret generic $(COMPONENT_NAME) --from-file=korral.yaml
.PHONY: korral-override

kubernetes:
	-$(kubectl) create namespace $(NAMESPACE)
	$(kubectl) apply -f crd/korral.yaml
	$(kubectl) apply -f templates/rbac.yaml
	$(kubectl) apply -f templates/deployment.yaml
.PHONY: kubernetes

undeploy:
	-$(kubectl) delete -f templates/deployment.yaml
	-$(kubectl) delete -f templates/rbac.yaml
.PHONY: undeploy

install:
	@npm install
.PHONY: install

lint:
	@npm run lint
.PHONY: lint

test:
	@npm test
.PHONY: test

run:
	@npm start
.PHONY: run

push-latest: IMAGE_TAG:=latest
push-latest: login push-version push-tag
.PHONY: push-latest

push-version:
	$(docker) push $(HUB_IMAGE):$(IMAGE_VERSION)
.PHONY: push-version

push-tag:
	$(docker) tag $(HUB_IMAGE):$(IMAGE_VERSION) $(HUB_IMAGE):$(IMAGE_TAG)
	$(docker) push $(HUB_IMAGE):$(IMAGE_TAG)
.PHONY: push-tag

pull-latest:
	docker pull $(HUB_IMAGE):latest
.PHONY: pull-latest

push-stable: pull-latest
	$(MAKE) push-tag IMAGE_VERSION=latest IMAGE_TAG=stable
.PHONY: push-stable

push-stage: pull-latest
	$(MAKE) push-tag IMAGE_VERSION=latest IMAGE_TAG=stage
.PHONY: push-stage

push-preview: pull-latest
	$(MAKE) push-tag IMAGE_VERSION=latest IMAGE_TAG=preview
.PHONY: push-preview

login:
	@touch $(HUB_PASS)
	@echo "Please put Docker Hub password into $(HUB_PASS)"
	cat $(HUB_PASS) | docker login --username agilestacks --password-stdin
.PHONY: login
